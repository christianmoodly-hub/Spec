/**
 * Heuristic form-field matcher. Pure functions only — no DOM.
 *
 * Order:
 * 1. Synonym table vs structuredFields
 * 2. customFields, then eeoAnswers (exact / near-exact question labels)
 * 3. unmatched — never guess
 */

import type { ProfileAddress, ProfileStructuredFields } from '../../types'
import {
  FIELD_NEGATIVES,
  FIELD_SYNONYMS,
  type StructuredMatchKey,
} from './synonyms'

export type { StructuredMatchKey }

export interface ScannedField {
  label: string
  name: string
  id: string
  placeholder: string
  type: string
}

export type FieldMatch =
  | {
      status: 'matched'
      value: string
      key: StructuredMatchKey | 'customFields' | 'eeoAnswers'
      recordKey?: string
    }
  | { status: 'unmatched' }

const UNMATCHED: FieldMatch = { status: 'unmatched' }

const UNFILLABLE_TYPES = new Set([
  'password',
  'file',
  'hidden',
  'submit',
  'button',
  'image',
  'reset',
  'range',
  'color',
  'week',
  'month',
  'datetime-local',
  'time',
])

/** Tokens allowed around a synonym so "your email address" still matches email. */
const WRAP_NOISE = new Set([
  'a',
  'an',
  'the',
  'your',
  'my',
  'please',
  'enter',
  'provide',
  'fill',
  'type',
  'applicant',
  'candidate',
  'employee',
  'personal',
  'primary',
  'preferred',
  'current',
  'home',
  'contact',
  'legal',
  'full',
  'complete',
  'official',
  'main',
  'work',
  'mobile',
  'cell',
  'number',
  'num',
  'no',
  'address',
  'field',
  'form',
  'input',
  'txt',
  'text',
  'id',
  'user',
  'info',
  'information',
  'details',
  'required',
  'optional',
  'select',
  'choose',
  'here',
  'below',
  'this',
  'is',
  'are',
  'of',
  'and',
  'or',
  'to',
  'for',
  'in',
  'on',
  'at',
  'with',
  'profile',
  'url',
  'link',
  'uri',
  'https',
  'www',
  'com',
])

const QUESTION_PREFIXES = [
  'please enter your',
  'please provide your',
  'please enter',
  'please provide',
  'kindly enter',
  'what is your',
  'whats your',
  'what is',
  'whats',
  'enter your',
  'provide your',
  'enter',
  'your',
]

type CompiledSynonym = {
  key: StructuredMatchKey
  tokens: string[]
}

const COMPILED_SYNONYMS: CompiledSynonym[] = compileSynonyms()
const COMPILED_NEGATIVES: Record<string, string[][]> = compileNegatives()

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[''`´]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function identToText(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_\-.[\]#]+/g, ' ')
}

export function matchField(
  field: ScannedField,
  structuredFields: ProfileStructuredFields,
): FieldMatch {
  if (UNFILLABLE_TYPES.has(field.type.trim().toLowerCase())) {
    return UNMATCHED
  }

  const synonymMatch = matchSynonym(field, structuredFields)
  if (synonymMatch) {
    return synonymMatch
  }

  const customMatch = matchRecord(
    field,
    structuredFields.customFields,
    'customFields',
  )
  if (customMatch) {
    return customMatch
  }

  const eeoMatch = matchRecord(
    field,
    structuredFields.eeoAnswers,
    'eeoAnswers',
  )
  if (eeoMatch) {
    return eeoMatch
  }

  return UNMATCHED
}

function matchSynonym(
  field: ScannedField,
  structuredFields: ProfileStructuredFields,
): FieldMatch | null {
  const type = field.type.trim().toLowerCase()
  if (type === 'checkbox' || type === 'radio' || type === 'date') {
    return null
  }

  for (const source of synonymSources(field)) {
    const tokens = tokenize(source)
    if (tokens.length === 0) {
      continue
    }
    const key = findSynonymKey(tokens, type)
    if (!key) {
      continue
    }
    const value = valueForStructuredKey(structuredFields, key)
    if (value) {
      return { status: 'matched', value, key }
    }
    return null
  }
  return null
}

function matchRecord(
  field: ScannedField,
  record: Record<string, string>,
  key: 'customFields' | 'eeoAnswers',
): FieldMatch | null {
  const entries = Object.entries(record).filter(([, value]) => value.trim())
  if (entries.length === 0) {
    return null
  }

  const label = field.label.trim()
  if (label) {
    const hit = bestRecordMatch(label, entries, true)
    if (hit) {
      return { status: 'matched', value: hit.value, key, recordKey: hit.recordKey }
    }
  }

  const placeholder = field.placeholder.trim()
  if (placeholder) {
    const hit = bestRecordMatch(placeholder, entries, true)
    if (hit) {
      return { status: 'matched', value: hit.value, key, recordKey: hit.recordKey }
    }
  }

  for (const raw of [field.name, field.id]) {
    if (!raw.trim()) {
      continue
    }
    const hit = bestRecordMatch(identToText(raw), entries, false)
    if (hit) {
      return { status: 'matched', value: hit.value, key, recordKey: hit.recordKey }
    }
  }

  return null
}

function bestRecordMatch(
  question: string,
  entries: Array<[string, string]>,
  allowNear: boolean,
): { recordKey: string; value: string } | null {
  let best: { recordKey: string; value: string; score: number } | null = null
  for (const [recordKey, value] of entries) {
    const score = labelSimilarity(question, recordKey, allowNear)
    if (score <= 0) {
      continue
    }
    if (!best || score > best.score) {
      best = { recordKey, value: value.trim(), score }
    }
  }
  return best
}

export function labelSimilarity(
  left: string,
  right: string,
  allowNear: boolean,
): number {
  const a = canonicalQuestion(left)
  const b = canonicalQuestion(right)
  if (!a || !b) {
    return 0
  }
  if (a === b) {
    return 1
  }
  if (!allowNear) {
    return 0
  }
  const ta = a.split(' ')
  const tb = b.split(' ')
  if (Math.min(ta.length, tb.length) <= 2) {
    return 0
  }
  const jaccard = tokenJaccard(ta, tb)
  if (jaccard >= 0.8) {
    return jaccard
  }
  const [shorter, longer] = ta.length <= tb.length ? [a, b] : [b, a]
  if (shorter.split(' ').length >= 4 && longer.includes(shorter)) {
    return 0.75
  }
  return 0
}

function findSynonymKey(
  haystack: string[],
  type: string,
): StructuredMatchKey | null {
  for (const entry of COMPILED_SYNONYMS) {
    if (!typeCompatible(type, entry.key)) {
      continue
    }
    if (hasNegative(haystack, entry.key)) {
      continue
    }
    if (synonymHits(haystack, entry.tokens)) {
      return entry.key
    }
  }
  return null
}

function synonymHits(haystack: string[], synonym: string[]): boolean {
  if (synonym.length === 0) {
    return false
  }
  if (synonym.length === 1) {
    return isNoiseWrapped(haystack, synonym)
  }
  return containsPhrase(haystack, synonym)
}

function isNoiseWrapped(haystack: string[], synonym: string[]): boolean {
  const start = indexOfPhrase(haystack, synonym)
  if (start < 0) {
    return false
  }
  const end = start + synonym.length
  for (let i = 0; i < start; i += 1) {
    if (!isWrapNoise(haystack[i])) {
      return false
    }
  }
  for (let i = end; i < haystack.length; i += 1) {
    if (!isWrapNoise(haystack[i])) {
      return false
    }
  }
  return true
}

function containsPhrase(haystack: string[], phrase: string[]): boolean {
  return indexOfPhrase(haystack, phrase) >= 0
}

function indexOfPhrase(haystack: string[], phrase: string[]): number {
  if (phrase.length === 0 || phrase.length > haystack.length) {
    return -1
  }
  for (let i = 0; i <= haystack.length - phrase.length; i += 1) {
    let ok = true
    for (let j = 0; j < phrase.length; j += 1) {
      if (haystack[i + j] !== phrase[j]) {
        ok = false
        break
      }
    }
    if (ok) {
      return i
    }
  }
  return -1
}

function hasNegative(haystack: string[], key: StructuredMatchKey): boolean {
  const phrases = COMPILED_NEGATIVES[key]
  if (!phrases) {
    return false
  }
  return phrases.some((phrase) => containsPhrase(haystack, phrase))
}

function typeCompatible(type: string, key: StructuredMatchKey): boolean {
  if (type === 'email') {
    return key === 'email'
  }
  if (type === 'tel') {
    return key === 'phone'
  }
  if (type === 'url') {
    return key === 'linkedinUrl' || key === 'portfolioUrl'
  }
  if (type === 'number') {
    return key === 'yearsExperience' || key === 'salaryExpectation'
  }
  return true
}

function synonymSources(field: ScannedField): string[] {
  if (field.label.trim()) {
    return [field.label]
  }
  const out: string[] = []
  if (field.placeholder.trim()) {
    out.push(field.placeholder)
  }
  if (field.name.trim()) {
    out.push(identToText(field.name))
  }
  if (field.id.trim()) {
    out.push(identToText(field.id))
  }
  return out
}

export function valueForStructuredKey(
  fields: ProfileStructuredFields,
  key: StructuredMatchKey,
): string {
  if (key.startsWith('address.')) {
    const sub = key.slice('address.'.length) as keyof ProfileAddress
    return fields.address[sub].trim()
  }
  return fields[key as Exclude<StructuredMatchKey, `address.${string}`>].trim()
}

function canonicalQuestion(value: string): string {
  let text = normalizeText(value)
  for (const prefix of QUESTION_PREFIXES) {
    if (text === prefix) {
      return ''
    }
    if (text.startsWith(`${prefix} `)) {
      text = text.slice(prefix.length).trim()
      break
    }
  }
  return text
}

function tokenize(value: string): string[] {
  const normalized = normalizeText(value)
  return normalized ? normalized.split(' ') : []
}

function tokenJaccard(left: string[], right: string[]): number {
  const a = new Set(left)
  const b = new Set(right)
  let inter = 0
  for (const token of a) {
    if (b.has(token)) {
      inter += 1
    }
  }
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}

function isWrapNoise(token: string): boolean {
  return WRAP_NOISE.has(token) || /^\d+$/.test(token)
}

function compileSynonyms(): CompiledSynonym[] {
  const compiled: CompiledSynonym[] = []
  for (const [key, phrases] of Object.entries(FIELD_SYNONYMS) as Array<
    [StructuredMatchKey, readonly string[]]
  >) {
    for (const phrase of phrases) {
      const tokens = tokenize(phrase)
      if (tokens.length === 0) {
        continue
      }
      compiled.push({ key, tokens })
    }
  }
  compiled.sort((left, right) => {
    const tokenDelta = right.tokens.length - left.tokens.length
    if (tokenDelta !== 0) {
      return tokenDelta
    }
    return right.tokens.join(' ').length - left.tokens.join(' ').length
  })
  return compiled
}

function compileNegatives(): Record<string, string[][]> {
  const out: Record<string, string[][]> = {}
  for (const [key, phrases] of Object.entries(FIELD_NEGATIVES)) {
    out[key] = (phrases ?? [])
      .map((phrase) => tokenize(phrase))
      .filter((tokens) => tokens.length > 0)
  }
  return out
}
