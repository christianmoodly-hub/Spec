import { matchField, type ScannedField } from '../lib/autofill/matcher'
import {
  compactProfileContext,
  profileHasFillData,
} from '../lib/autofill/profileContext'
import {
  isPlaceholderOption,
  matchSelectOption,
  type SelectOption,
} from '../lib/autofill/selectMatch'
import {
  setFillSession,
  type FillRecord,
  type FillSource,
} from '../lib/autofill/session'
import {
  MSG_GET_PROFILE_FIELDS,
  MSG_MATCH_SELECT,
  type SpesRequest,
  type SpesResponse,
} from '../lib/messages'
import { emptyStructuredFields } from '../lib/profileFields'
import type { ProfileStructuredFields } from '../types'
import { normalizeText } from './dom'
import { dismissFillReview, showFillReview } from './fillReview'
import { mountSavePanel } from './savePanel'

const HOST_ID = 'spes-autofill-root'
const TEXT_TYPES = new Set(['text', 'email', 'tel', 'number', 'url'])
const FILE_HINT = 'Attach your CV/resume manually here'

function send(message: SpesRequest): Promise<SpesResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: SpesResponse) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      resolve(response ?? { ok: false, error: 'No response.' })
    })
  })
}

function isSpesTree(node: Element): boolean {
  return Boolean(node.closest('[id^="spes-"]')) || node.id.startsWith('spes-')
}

function isControl(node: Element): boolean {
  return (
    node instanceof HTMLInputElement ||
    node instanceof HTMLTextAreaElement ||
    node instanceof HTMLSelectElement ||
    node instanceof HTMLButtonElement
  )
}

function isDisplayed(el: HTMLElement): boolean {
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') {
    return false
  }
  const style = getComputedStyle(el)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

function collectControls(root: Document | ShadowRoot): HTMLElement[] {
  const out: HTMLElement[] = []
  for (const node of root.querySelectorAll('input, textarea, select')) {
    if (node instanceof HTMLElement && !isSpesTree(node)) {
      out.push(node)
    }
  }
  for (const node of root.querySelectorAll('*')) {
    if (!(node instanceof HTMLElement) || !node.shadowRoot) {
      continue
    }
    if (node.id.startsWith('spes-')) {
      continue
    }
    out.push(...collectControls(node.shadowRoot))
  }
  return out
}

function labelForSelector(id: string): string {
  const escaped =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(id)
      : id.replace(/"/g, '\\"')
  return `label[for="${escaped}"]`
}

function textWithoutControls(root: HTMLElement, skip: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement
  for (const node of clone.querySelectorAll('input, textarea, select, button')) {
    node.remove()
  }
  if (skip.id) {
    const escaped =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(skip.id)
        : skip.id.replace(/"/g, '\\"')
    clone.querySelector(`#${escaped}`)?.remove()
  }
  return normalizeText(clone.textContent ?? '')
}

function textBefore(parent: HTMLElement, child: Node): string {
  const parts: string[] = []
  for (const node of parent.childNodes) {
    if (node === child || (node instanceof Element && node.contains(child))) {
      break
    }
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? '')
      continue
    }
    if (node instanceof HTMLElement && !isControl(node)) {
      parts.push(node.innerText || node.textContent || '')
    }
  }
  const text = normalizeText(parts.join(' '))
  return text.length <= 120 ? text : ''
}

function nearbyLabel(el: HTMLElement): string {
  const cell = el.closest('td, th')
  if (cell instanceof HTMLElement) {
    const header = cell.parentElement?.querySelector('th')
    if (header instanceof HTMLElement && header !== cell) {
      const text = normalizeText(header.textContent ?? '')
      if (text) {
        return text
      }
    }
  }
  let sibling = el.previousElementSibling
  let hops = 0
  while (sibling && hops < 3) {
    if (!isControl(sibling)) {
      const text = normalizeText(sibling.textContent ?? '')
      if (text && text.length <= 120) {
        return text
      }
    }
    sibling = sibling.previousElementSibling
    hops += 1
  }
  const parent = el.parentElement
  if (parent && parent !== document.body) {
    const before = textBefore(parent, el)
    if (before) {
      return before
    }
  }
  const legend = el.closest('fieldset')?.querySelector(':scope > legend')
  if (legend) {
    return normalizeText(legend.textContent ?? '')
  }
  return ''
}

function associatedLabel(el: HTMLElement): string {
  const aria = el.getAttribute('aria-label')
  if (aria?.trim()) {
    return normalizeText(aria)
  }
  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
    if (normalizeText(text)) {
      return normalizeText(text)
    }
  }
  if (el.id) {
    const byFor = document.querySelector(labelForSelector(el.id))
    if (byFor instanceof HTMLElement) {
      const text = textWithoutControls(byFor, el)
      if (text) {
        return text
      }
    }
  }
  const wrap = el.closest('label')
  if (wrap instanceof HTMLElement) {
    const text = textWithoutControls(wrap, el)
    if (text) {
      return text
    }
  }
  return nearbyLabel(el)
}

function toScanned(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): ScannedField {
  const type =
    el instanceof HTMLSelectElement
      ? 'select-one'
      : el instanceof HTMLTextAreaElement
        ? 'textarea'
        : el.type
  return {
    label: associatedLabel(el),
    name: el.getAttribute('name') ?? '',
    id: el.id ?? '',
    placeholder: el.getAttribute('placeholder') ?? '',
    type,
  }
}

function readOptions(select: HTMLSelectElement): SelectOption[] {
  return [...select.options].map((option) => ({
    value: option.value,
    text: option.text,
    disabled: option.disabled,
  }))
}

function coerceValue(type: string, value: string): string {
  if (type !== 'number') {
    return value
  }
  const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  return match ? match[0] : value
}

function setInputValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  const desc = Object.getOwnPropertyDescriptor(proto, 'value')
  el.focus()
  if (desc?.set) {
    desc.set.call(el, value)
  } else {
    el.value = value
  }
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

function setSelectValue(el: HTMLSelectElement, option: SelectOption): void {
  const desc = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    'value',
  )
  el.focus()
  if (desc?.set) {
    desc.set.call(el, option.value)
  } else {
    el.value = option.value
  }
  for (const item of el.options) {
    item.selected = item.value === option.value
  }
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

function markFileInput(input: HTMLInputElement): void {
  if (input.dataset.spesFileHint === '1') {
    return
  }
  input.dataset.spesFileHint = '1'
  const hint = document.createElement('span')
  hint.textContent = FILE_HINT
  hint.setAttribute('data-spes-file-hint', '1')
  hint.style.cssText = [
    'display:inline-block',
    'margin:4px 0 0 8px',
    'padding:3px 8px',
    'background:#fff4f7',
    'color:#4a1830',
    'border:1px solid #f5b8cc',
    'border-radius:4px',
    'font:12px/1.35 Segoe UI,system-ui,sans-serif',
    'vertical-align:middle',
  ].join(';')
  input.insertAdjacentElement('afterend', hint)
}

function recordFill(
  records: FillRecord[],
  element: FillRecord['element'],
  label: string,
  value: string,
  previousValue: string,
  source: FillSource,
): boolean {
  if (previousValue === value) {
    return false
  }
  records.push({ element, label, value, previousValue, source })
  return true
}

function isEmptyControl(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): boolean {
  if (el instanceof HTMLSelectElement) {
    const selected = el.selectedOptions[0]
    if (!el.value.trim()) {
      return true
    }
    return Boolean(
      selected &&
        isPlaceholderOption({
          value: selected.value,
          text: selected.text,
        }),
    )
  }
  return !el.value.trim()
}

function countUnfilled(
  controls: HTMLElement[],
  records: FillRecord[],
): number {
  const filled = new Set<HTMLElement>(records.map((record) => record.element))
  let count = 0
  for (const el of controls) {
    if (filled.has(el)) {
      continue
    }
    if (el instanceof HTMLInputElement && el.type === 'file') {
      count += 1
      continue
    }
    if (el instanceof HTMLInputElement && TEXT_TYPES.has(el.type)) {
      if (!el.disabled && !el.readOnly && isEmptyControl(el)) {
        count += 1
      }
      continue
    }
    if (el instanceof HTMLTextAreaElement) {
      if (!el.disabled && !el.readOnly && isEmptyControl(el)) {
        count += 1
      }
      continue
    }
    if (el instanceof HTMLSelectElement && !el.multiple && !el.disabled) {
      if (isEmptyControl(el)) {
        count += 1
      }
    }
  }
  return count
}

async function pickSelectWithAi(
  label: string,
  options: SelectOption[],
  profileContext: string,
  heuristicValue?: string,
): Promise<SelectOption | null> {
  const listed = options
    .filter((option) => !isPlaceholderOption(option))
    .map((option) => option.text.trim() || option.value)
  if (listed.length === 0) {
    return null
  }
  try {
    const response = await send({
      type: MSG_MATCH_SELECT,
      label,
      options: listed,
      profileContext,
      heuristicValue,
    })
    const text = response.ok ? response.optionText?.trim() : ''
    if (!text || /^none$/i.test(text)) {
      return null
    }
    return matchSelectOption(text, options)
  } catch {
    return null
  }
}

async function autofill(setStatus: (text: string) => void): Promise<void> {
  dismissFillReview()
  setStatus('Loading profile…')
  const response = await send({ type: MSG_GET_PROFILE_FIELDS })
  if (!response.ok) {
    throw new Error(response.error)
  }
  const fields: ProfileStructuredFields =
    response.structuredFields ?? emptyStructuredFields()
  const rawDump = response.rawDump ?? ''
  if (!profileHasFillData(fields, rawDump)) {
    throw new Error('Add profile fields in Options first.')
  }
  const context = compactProfileContext(fields, rawDump)
  const records: FillRecord[] = []
  const controls = collectControls(document).filter(isDisplayed)

  for (const el of controls) {
    if (el instanceof HTMLInputElement && el.type === 'file') {
      markFileInput(el)
      continue
    }
    if (el instanceof HTMLInputElement && TEXT_TYPES.has(el.type)) {
      if (el.disabled || el.readOnly) {
        continue
      }
      const scanned = toScanned(el)
      const match = matchField(scanned, fields)
      if (match.status !== 'matched') {
        continue
      }
      const value = coerceValue(el.type, match.value)
      const previous = el.value
      setInputValue(el, value)
      recordFill(records, el, scanned.label, value, previous, 'heuristic')
      continue
    }
    if (el instanceof HTMLTextAreaElement) {
      if (el.disabled || el.readOnly) {
        continue
      }
      const scanned = toScanned(el)
      const match = matchField(scanned, fields)
      if (match.status !== 'matched') {
        continue
      }
      const previous = el.value
      setInputValue(el, match.value)
      recordFill(records, el, scanned.label, match.value, previous, 'heuristic')
      continue
    }
    if (!(el instanceof HTMLSelectElement) || el.multiple || el.disabled) {
      continue
    }
    const scanned = toScanned(el)
    const options = readOptions(el)
    const match = matchField(scanned, fields)
    let picked =
      match.status === 'matched'
        ? matchSelectOption(match.value, options)
        : null
    let source: FillSource = 'heuristic'
    if (!picked) {
      setStatus(`Matching dropdown: ${scanned.label || 'question'}…`)
      picked = await pickSelectWithAi(
        scanned.label || scanned.placeholder || scanned.name,
        options,
        context,
        match.status === 'matched' ? match.value : undefined,
      )
      source = 'ai'
    }
    if (!picked) {
      continue
    }
    const previous = el.value
    setSelectValue(el, picked)
    recordFill(
      records,
      el,
      scanned.label,
      picked.text.trim() || picked.value,
      previous,
      source,
    )
  }

  setFillSession(records)
  const unfilledCount = countUnfilled(controls, records)
  showFillReview({ records, unfilledCount })
  const extra =
    unfilledCount > 0
      ? ` ${unfilledCount} left unfilled.`
      : ''
  setStatus(
    records.length === 0
      ? `No confident matches.${extra}`
      : `Filled ${records.length} field${records.length === 1 ? '' : 's'}.${extra}`,
  )
}

function shouldMount(): boolean {
  if (window === window.top) {
    return true
  }
  return collectControls(document).length > 0
}

if (shouldMount()) {
  mountSavePanel({
    hostId: HOST_ID,
    title: 'Spes',
    actionLabel: 'Auto-fill with Spes',
    hint: 'Fills matching fields from your profile. Review before you submit.',
    side: 'left',
    onAction: autofill,
  })
}

console.debug('[spes] autofill content script loaded')
