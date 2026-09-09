import type {
  ProfileAddress,
  ProfileStructuredFields,
} from '../types'
import { storedDateOfBirth } from './autofill/date'

export const DEFAULT_CUSTOM_FIELDS: Record<string, string> = {
  'Is there any pending misconduct or investigation against you?': 'No',
  'Have you ever been dismissed?': 'No',
}

export function emptyAddress(): ProfileAddress {
  return {
    street: '',
    city: '',
    stateProvince: '',
    postalCode: '',
    country: '',
  }
}

export function emptyStructuredFields(): ProfileStructuredFields {
  return {
    fullName: '',
    email: '',
    phone: '',
    address: emptyAddress(),
    linkedinUrl: '',
    portfolioUrl: '',
    workAuthorization: '',
    yearsExperience: '',
    salaryExpectation: '',
    noticePeriod: '',
    dateOfBirth: '',
    eeoAnswers: {},
    customFields: { ...DEFAULT_CUSTOM_FIELDS },
  }
}

export function cloneStructuredFields(
  fields: ProfileStructuredFields,
): ProfileStructuredFields {
  return {
    ...fields,
    address: { ...fields.address },
    eeoAnswers: { ...fields.eeoAnswers },
    customFields: { ...fields.customFields },
  }
}

function asString(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (value == null) {
    return ''
  }
  return String(value)
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  const out: Record<string, string> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const label = key.replace(/[~*/[\]]/g, ' ').replace(/\s+/g, ' ').trim()
    if (!label) {
      continue
    }
    out[label] = asString(item)
  }
  return out
}

export function asProfileAddress(value: unknown): ProfileAddress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return emptyAddress()
  }
  const record = value as Record<string, unknown>
  return {
    street: asString(record.street).trim(),
    city: asString(record.city).trim(),
    stateProvince: asString(
      record.stateProvince ?? record['state/province'] ?? record.state,
    ).trim(),
    postalCode: asString(record.postalCode).trim(),
    country: asString(record.country).trim(),
  }
}

export function asStructuredFields(value: unknown): ProfileStructuredFields {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return emptyStructuredFields()
  }
  const record = value as Record<string, unknown>
  return {
    fullName: asString(record.fullName).trim(),
    email: asString(record.email).trim(),
    phone: asString(record.phone).trim(),
    address: asProfileAddress(record.address),
    linkedinUrl: asString(record.linkedinUrl).trim(),
    portfolioUrl: asString(record.portfolioUrl).trim(),
    workAuthorization: asString(record.workAuthorization).trim(),
    yearsExperience: asString(record.yearsExperience).trim(),
    salaryExpectation: asString(record.salaryExpectation).trim(),
    noticePeriod: asString(record.noticePeriod).trim(),
    dateOfBirth: storedDateOfBirth(asString(record.dateOfBirth)),
    eeoAnswers: asStringRecord(record.eeoAnswers),
    customFields: asStringRecord(record.customFields),
  }
}

export function applyProfileDefaults(
  fields: ProfileStructuredFields,
): ProfileStructuredFields {
  return {
    ...fields,
    dateOfBirth: storedDateOfBirth(fields.dateOfBirth),
    customFields: mergeDefaultCustomFields(fields.customFields),
  }
}

function mergeDefaultCustomFields(
  existing: Record<string, string>,
): Record<string, string> {
  const out = { ...existing }
  for (const [key, value] of Object.entries(DEFAULT_CUSTOM_FIELDS)) {
    if (!out[key]?.trim()) {
      out[key] = value
    }
  }
  return out
}

export const PROFILE_SCALAR_FIELDS = [
  ['fullName', 'Full name'],
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['linkedinUrl', 'LinkedIn URL'],
  ['portfolioUrl', 'Portfolio URL'],
  ['workAuthorization', 'Work authorization'],
  ['yearsExperience', 'Years of experience'],
  ['salaryExpectation', 'Salary expectation'],
  ['noticePeriod', 'Notice period'],
  ['dateOfBirth', 'Date of birth'],
] as const satisfies ReadonlyArray<
  readonly [keyof Omit<
    ProfileStructuredFields,
    'address' | 'eeoAnswers' | 'customFields'
  >, string]
>

export const PROFILE_ADDRESS_FIELDS = [
  ['street', 'Street'],
  ['city', 'City'],
  ['stateProvince', 'State / province'],
  ['postalCode', 'Postal code'],
  ['country', 'Country'],
] as const satisfies ReadonlyArray<readonly [keyof ProfileAddress, string]>

type ScalarKey = (typeof PROFILE_SCALAR_FIELDS)[number][0]
type AddressKey = (typeof PROFILE_ADDRESS_FIELDS)[number][0]

export type ReviewTarget =
  | { kind: 'scalar'; key: ScalarKey }
  | { kind: 'address'; key: AddressKey }
  | { kind: 'eeo'; key: string }
  | { kind: 'custom'; key: string }

export type ReviewRow = {
  id: string
  label: string
  current: string
  proposed: string
  useProposed: boolean
  target: ReviewTarget
}

export function buildReviewRows(
  current: ProfileStructuredFields,
  proposed: ProfileStructuredFields,
): ReviewRow[] {
  const rows: ReviewRow[] = []

  for (const [key, label] of PROFILE_SCALAR_FIELDS) {
    const cur = current[key]
    const next = proposed[key]
    if (!next || next === cur) {
      continue
    }
    rows.push({
      id: key,
      label,
      current: cur,
      proposed: next,
      useProposed: !cur,
      target: { kind: 'scalar', key },
    })
  }

  for (const [key, label] of PROFILE_ADDRESS_FIELDS) {
    const cur = current.address[key]
    const next = proposed.address[key]
    if (!next || next === cur) {
      continue
    }
    rows.push({
      id: `address.${key}`,
      label,
      current: cur,
      proposed: next,
      useProposed: !cur,
      target: { kind: 'address', key },
    })
  }

  for (const [key, next] of Object.entries(proposed.eeoAnswers)) {
    const cur = current.eeoAnswers[key] ?? ''
    if (!next || next === cur) {
      continue
    }
    rows.push({
      id: `eeo:${key}`,
      label: `EEO: ${key}`,
      current: cur,
      proposed: next,
      useProposed: !cur,
      target: { kind: 'eeo', key },
    })
  }

  for (const [key, next] of Object.entries(proposed.customFields)) {
    const cur = current.customFields[key] ?? ''
    if (!next || next === cur) {
      continue
    }
    rows.push({
      id: `custom:${key}`,
      label: key,
      current: cur,
      proposed: next,
      useProposed: !cur,
      target: { kind: 'custom', key },
    })
  }

  return rows
}

export function applyReviewRows(
  current: ProfileStructuredFields,
  rows: ReviewRow[],
): ProfileStructuredFields {
  const next = cloneStructuredFields(current)
  for (const row of rows) {
    if (!row.useProposed) {
      continue
    }
    const value = row.proposed.trim()
    switch (row.target.kind) {
      case 'scalar':
        next[row.target.key] = value
        break
      case 'address':
        next.address[row.target.key] = value
        break
      case 'eeo':
        if (value) {
          next.eeoAnswers[row.target.key] = value
        } else {
          delete next.eeoAnswers[row.target.key]
        }
        break
      case 'custom':
        if (value) {
          next.customFields[row.target.key] = value
        } else {
          delete next.customFields[row.target.key]
        }
        break
    }
  }
  return next
}
