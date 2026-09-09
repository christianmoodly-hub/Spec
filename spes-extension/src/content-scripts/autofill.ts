import {
  birthDatePart,
  datePartNeedles,
  formatDateForField,
  parseFlexibleDate,
} from '../lib/autofill/date'
import {
  formatSpesDebugLog,
  logSpesDebug,
  logSpesError,
} from '../lib/autofill/debugLog'
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
  FILL_RELAY_EVERY_MS,
  FILL_RELAY_MS,
  fillTokenFromEventData,
  makeFillPageMessage,
} from '../lib/autofill/fillBroadcast'
import {
  MSG_BEGIN_FILL,
  MSG_FILL_UNMATCHED,
  MSG_GET_PROFILE_FIELDS,
  MSG_VERIFY_FILL,
  type UnmatchedFormField,
  type SpesRequest,
  type SpesResponse,
} from '../lib/messages'
import { emptyStructuredFields } from '../lib/profileFields'
import type { ProfileStructuredFields } from '../types'
import { normalizeText } from './dom'
import { dismissFillReview, showFillReview } from './fillReview'
import { mountSavePanel, setSavePanelStatus } from './savePanel'

const HOST_ID = 'spes-autofill-root'
const TEXT_TYPES = new Set(['text', 'email', 'tel', 'number', 'url', 'search'])
const DATE_TYPES = new Set(['date', 'datetime-local', 'month'])
const FILE_HINT = 'Attach your CV/resume manually here'
const AI_FIELD_CAP = 25

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

function collectIframes(root: Document | ShadowRoot): HTMLIFrameElement[] {
  const out = [...root.querySelectorAll('iframe')]
  for (const node of root.querySelectorAll('*')) {
    if (!(node instanceof HTMLElement) || !node.shadowRoot) {
      continue
    }
    if (node.id.startsWith('spes-')) {
      continue
    }
    out.push(...collectIframes(node.shadowRoot))
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
  return text.length <= 280 ? text : ''
}

function visibleFieldControls(root: HTMLElement): Element[] {
  return [...root.querySelectorAll('input, textarea, select')].filter((node) => {
    if (!(node instanceof HTMLElement) || isSpesTree(node)) {
      return false
    }
    if (
      node instanceof HTMLInputElement &&
      (node.type === 'hidden' ||
        node.type === 'submit' ||
        node.type === 'button' ||
        node.type === 'reset' ||
        node.type === 'image')
    ) {
      return false
    }
    return true
  })
}

function looksLikeLabel(text: string): boolean {
  if (!text || text.length > 280) {
    return false
  }
  const words = text.split(/\s+/).filter(Boolean)
  return words.length > 0 && words.length <= 40
}

function firstChildLabel(root: HTMLElement, skip: HTMLElement): string {
  if (visibleFieldControls(root).filter((node) => node !== skip).length > 0) {
    return ''
  }
  const direct = [...root.children].find(
    (node) => node instanceof HTMLLabelElement,
  )
  if (direct instanceof HTMLElement) {
    const text = textWithoutControls(direct, skip)
    if (looksLikeLabel(text)) {
      return text
    }
  }
  const labeled = root.querySelector(
    ':scope > label, :scope > .control-label, :scope > .form-label, :scope > legend, :scope > dt',
  )
  if (labeled instanceof HTMLElement && !labeled.contains(skip)) {
    const text = textWithoutControls(labeled, skip)
    if (looksLikeLabel(text)) {
      return text
    }
  }
  return ''
}

function nearbyLabel(el: HTMLElement): string {
  const cell = el.closest('td, th')
  if (cell instanceof HTMLElement) {
    const row = cell.parentElement
    const header = row?.querySelector('th')
    if (header instanceof HTMLElement && header !== cell) {
      const text = normalizeText(header.textContent ?? '')
      if (looksLikeLabel(text)) {
        return text
      }
    }
    const prevCell = cell.previousElementSibling
    if (prevCell instanceof HTMLElement && !prevCell.querySelector('input, select, textarea')) {
      const text = normalizeText(prevCell.textContent ?? '')
      if (looksLikeLabel(text)) {
        return text
      }
    }
  }

  let sibling = el.previousElementSibling
  let hops = 0
  while (sibling && hops < 4) {
    if (sibling instanceof HTMLElement && !isControl(sibling)) {
      const nested = firstChildLabel(sibling, el)
      if (nested) {
        return nested
      }
      const text = normalizeText(sibling.textContent ?? '')
      if (looksLikeLabel(text) && !sibling.querySelector('input, select, textarea')) {
        return text
      }
    }
    sibling = sibling.previousElementSibling
    hops += 1
  }

  let node: HTMLElement | null = el.parentElement
  let depth = 0
  while (node && depth < 6 && node !== document.body) {
    const grouped = firstChildLabel(node, el)
    if (grouped) {
      return grouped
    }
    const before = textBefore(node, el)
    if (looksLikeLabel(before)) {
      return before
    }
    const prev = node.previousElementSibling
    if (prev instanceof HTMLElement && !isControl(prev)) {
      const prevLabel = firstChildLabel(prev, el)
      if (prevLabel) {
        return prevLabel
      }
      if (!prev.querySelector('input, select, textarea')) {
        const text = normalizeText(prev.textContent ?? '')
        if (looksLikeLabel(text)) {
          return text
        }
      }
    }
    node = node.parentElement
    depth += 1
  }

  const legend = el.closest('fieldset')?.querySelector(':scope > legend')
  if (legend) {
    const text = normalizeText(legend.textContent ?? '')
    if (looksLikeLabel(text)) {
      return text
    }
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
  const titled = el.getAttribute('title')
  if (titled?.trim() && looksLikeLabel(normalizeText(titled))) {
    return normalizeText(titled)
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

function coerceValue(
  type: string,
  value: string,
  hint: string,
): string {
  const formatted = formatDateForField(value, type, hint)
  if (type !== 'number') {
    return formatted
  }
  const match = formatted.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  return match ? match[0] : formatted
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

function setRadioChecked(radio: HTMLInputElement): void {
  const desc = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'checked',
  )
  radio.focus()
  if (desc?.set) {
    desc.set.call(radio, true)
  } else {
    radio.checked = true
  }
  radio.dispatchEvent(new Event('input', { bubbles: true }))
  radio.dispatchEvent(new Event('change', { bubbles: true }))
}

function radioOptionText(radio: HTMLInputElement): string {
  const wrap = radio.closest('label')
  if (wrap instanceof HTMLElement) {
    const text = textWithoutControls(wrap, radio)
    if (text) {
      return text
    }
  }
  return associatedLabel(radio) || radio.value
}

function radioGroups(controls: HTMLElement[]): HTMLInputElement[][] {
  const map = new Map<string, HTMLInputElement[]>()
  for (const el of controls) {
    if (
      !(el instanceof HTMLInputElement) ||
      el.type !== 'radio' ||
      el.disabled
    ) {
      continue
    }
    const key = el.name.trim()
    if (!key) {
      continue
    }
    const list = map.get(key) ?? []
    list.push(el)
    map.set(key, list)
  }
  return [...map.values()]
}

function radioGroupQuestion(radios: HTMLInputElement[]): string {
  const first = radios[0]
  const legend = first
    .closest('fieldset')
    ?.querySelector(':scope > legend')
  if (legend) {
    const text = normalizeText(legend.textContent ?? '')
    if (looksLikeLabel(text)) {
      return text
    }
  }
  let shared: HTMLElement | null = first.parentElement
  while (shared && shared !== document.body) {
    const extras = visibleFieldControls(shared).filter(
      (node) =>
        !(node instanceof HTMLInputElement && radios.includes(node)),
    )
    if (extras.length === 0 && radios.every((radio) => shared?.contains(radio))) {
      const grouped = firstChildLabel(shared, first)
      if (grouped) {
        return grouped
      }
      const prev = shared.previousElementSibling
      if (
        prev instanceof HTMLElement &&
        !prev.querySelector('input, select, textarea')
      ) {
        const text = normalizeText(prev.textContent ?? '')
        if (looksLikeLabel(text)) {
          return text
        }
      }
      const before = textBefore(shared, first)
      if (looksLikeLabel(before)) {
        return before
      }
    }
    shared = shared.parentElement
  }
  return nearbyLabel(first)
}

function radioGroupEmpty(radios: HTMLInputElement[]): boolean {
  const checked = radios.find((radio) => radio.checked)
  if (!checked) {
    return true
  }
  return isPlaceholderOption({
    value: checked.value,
    text: radioOptionText(checked),
  })
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

function isLockedInput(el: HTMLInputElement | HTMLTextAreaElement): boolean {
  if (el.disabled) {
    return true
  }
  if (el instanceof HTMLInputElement && DATE_TYPES.has(el.type)) {
    return false
  }
  return el.readOnly
}

function isFillableControl(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement) {
    if (el.type === 'file') {
      return true
    }
    if (TEXT_TYPES.has(el.type) || DATE_TYPES.has(el.type)) {
      return !isLockedInput(el)
    }
    return false
  }
  if (el instanceof HTMLTextAreaElement) {
    return !isLockedInput(el)
  }
  return el instanceof HTMLSelectElement && !el.multiple && !el.disabled
}

function countUnfilled(
  controls: HTMLElement[],
  records: FillRecord[],
): number {
  const filled = new Set<HTMLElement>(records.map((record) => record.element))
  let count = 0
  for (const el of controls) {
    if (filled.has(el) || !isFillableControl(el)) {
      continue
    }
    if (el instanceof HTMLInputElement && el.type === 'file') {
      count += 1
      continue
    }
    if (
      (el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement) &&
      isEmptyControl(el)
    ) {
      count += 1
    }
  }
  for (const radios of radioGroups(controls)) {
    if (radios.some((radio) => filled.has(radio))) {
      continue
    }
    if (radioGroupEmpty(radios)) {
      count += 1
    }
  }
  return count
}

function describeUnfilled(
  controls: HTMLElement[],
  records: FillRecord[],
): Array<{ label: string; type: string; name: string; id: string }> {
  const filled = new Set<HTMLElement>(records.map((record) => record.element))
  const out: Array<{ label: string; type: string; name: string; id: string }> =
    []
  for (const el of controls) {
    if (filled.has(el) || !isFillableControl(el)) {
      continue
    }
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement
    ) {
      if (el instanceof HTMLInputElement && el.type === 'file') {
        const scanned = toScanned(el)
        out.push({
          label: scanned.label,
          type: scanned.type,
          name: scanned.name,
          id: scanned.id,
        })
        continue
      }
      if (isEmptyControl(el)) {
        const scanned = toScanned(el)
        out.push({
          label: scanned.label,
          type: scanned.type,
          name: scanned.name,
          id: scanned.id,
        })
      }
    }
  }
  for (const radios of radioGroups(controls)) {
    if (radios.some((radio) => filled.has(radio))) {
      continue
    }
    if (!radioGroupEmpty(radios)) {
      continue
    }
    out.push({
      label: radioGroupQuestion(radios),
      type: 'radio',
      name: radios[0]?.name ?? '',
      id: radios[0]?.id ?? '',
    })
  }
  return out
}

function pickBirthSelect(
  scanned: ScannedField,
  options: SelectOption[],
  dateOfBirth: string,
): SelectOption | null {
  const part = birthDatePart(
    `${scanned.label} ${scanned.placeholder} ${scanned.name} ${scanned.id}`,
  )
  const parts = parseFlexibleDate(dateOfBirth)
  if (!part || !parts) {
    return null
  }
  for (const needle of datePartNeedles(parts, part)) {
    const hit = matchSelectOption(needle, options)
    if (hit) {
      return hit
    }
  }
  return null
}

type Leftover = {
  id: string
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  scanned: ScannedField
  options?: SelectOption[]
  radios?: HTMLInputElement[]
}

function hasQuestionText(scanned: ScannedField): boolean {
  return Boolean(scanned.label.trim() || scanned.placeholder.trim())
}

async function fillLeftoversWithAi(
  pending: Leftover[],
  profileContext: string,
  records: FillRecord[],
): Promise<void> {
  if (pending.length === 0) {
    return
  }
  const fields: UnmatchedFormField[] = pending.map((item) => ({
    id: item.id,
    label: item.scanned.label || item.scanned.placeholder || item.scanned.name,
    type: item.scanned.type,
    options: item.options
      ?.filter((option) => !isPlaceholderOption(option))
      .map((option) => option.text.trim() || option.value)
      .filter(Boolean)
      .slice(0, 80),
  }))
  const response = await send({
    type: MSG_FILL_UNMATCHED,
    fields,
    profileContext,
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
  const answers = response.answers ?? {}
  for (const item of pending) {
    const raw = answers[item.id]?.trim()
    if (!raw) {
      continue
    }
    if (item.radios && item.radios.length > 0) {
      const picked = matchSelectOption(raw, item.options ?? [])
      const radio = picked
        ? item.radios.find((node) => node.value === picked.value)
        : undefined
      if (!picked || !radio) {
        continue
      }
      const previous = item.radios.find((node) => node.checked)?.value ?? ''
      setRadioChecked(radio)
      recordFill(
        records,
        radio,
        item.scanned.label,
        picked.text.trim() || picked.value,
        previous,
        'ai',
      )
      continue
    }
    if (item.el instanceof HTMLSelectElement) {
      const picked = matchSelectOption(raw, item.options ?? [])
      if (!picked) {
        continue
      }
      const previous = item.el.value
      setSelectValue(item.el, picked)
      recordFill(
        records,
        item.el,
        item.scanned.label,
        picked.text.trim() || picked.value,
        previous,
        'ai',
      )
      continue
    }
    const value = coerceValue(
      item.scanned.type,
      raw,
      `${item.scanned.label} ${item.scanned.placeholder}`,
    )
    const previous = item.el.value
    setInputValue(item.el, value)
    recordFill(records, item.el, item.scanned.label, value, previous, 'ai')
  }
}

async function copyDebugLog(): Promise<void> {
  const text = await formatSpesDebugLog()
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.left = '-9999px'
    document.body.append(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
}

async function autofill(setStatus: (text: string) => void): Promise<void> {
  const controls = collectControls(document).filter(isDisplayed)
  if (controls.length === 0) {
    const nested = collectIframes(document).length
    setStatus(
      nested > 0
        ? 'No fields in this frame. Fill sent to embedded forms.'
        : 'No fields in this frame.',
    )
    return
  }
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
  const leftovers: Leftover[] = []
  let leftoverIndex = 0

  for (const el of controls) {
    if (el instanceof HTMLInputElement && el.type === 'file') {
      markFileInput(el)
      continue
    }
    const isText =
      el instanceof HTMLInputElement &&
      (TEXT_TYPES.has(el.type) || DATE_TYPES.has(el.type))
    if (isText || el instanceof HTMLTextAreaElement) {
      if (isLockedInput(el)) {
        continue
      }
      const scanned = toScanned(el)
      const match = matchField(scanned, fields)
      if (match.status !== 'matched') {
        leftovers.push({
          id: `f${leftoverIndex}`,
          el,
          scanned,
        })
        leftoverIndex += 1
        continue
      }
      const value = coerceValue(
        scanned.type,
        match.value,
        `${scanned.label} ${scanned.placeholder}`,
      )
      const previous = el.value
      setInputValue(el, value)
      recordFill(records, el, scanned.label, value, previous, 'heuristic')
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
    if (!picked) {
      picked = pickBirthSelect(scanned, options, fields.dateOfBirth)
    }
    if (!picked) {
      leftovers.push({
        id: `f${leftoverIndex}`,
        el,
        scanned,
        options,
      })
      leftoverIndex += 1
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
      'heuristic',
    )
  }

  for (const radios of radioGroups(controls)) {
    if (!radioGroupEmpty(radios)) {
      continue
    }
    const scanned: ScannedField = {
      label: radioGroupQuestion(radios),
      name: radios[0]?.name ?? '',
      id: radios[0]?.id ?? '',
      placeholder: '',
      type: 'radio',
    }
    const options = radios.map((radio) => ({
      value: radio.value,
      text: radioOptionText(radio) || radio.value,
    }))
    const match = matchField(scanned, fields)
    const picked =
      match.status === 'matched'
        ? matchSelectOption(match.value, options)
        : null
    const radio = picked
      ? radios.find((node) => node.value === picked.value)
      : undefined
    if (!picked || !radio) {
      leftovers.push({
        id: `f${leftoverIndex}`,
        el: radios[0],
        scanned,
        options,
        radios,
      })
      leftoverIndex += 1
      continue
    }
    const previous = radios.find((node) => node.checked)?.value ?? ''
    setRadioChecked(radio)
    recordFill(
      records,
      radio,
      scanned.label,
      picked.text.trim() || picked.value,
      previous,
      'heuristic',
    )
  }

  const aiBatch = leftovers
    .filter((item) =>
      item.radios
        ? radioGroupEmpty(item.radios)
        : isEmptyControl(item.el),
    )
    .filter((item) => hasQuestionText(item.scanned))
    .slice(0, AI_FIELD_CAP)
  if (aiBatch.length > 0) {
    setStatus(`Matching ${aiBatch.length} leftover field${aiBatch.length === 1 ? '' : 's'}…`)
    try {
      await fillLeftoversWithAi(aiBatch, context, records)
    } catch (error) {
      await logSpesError('autofill-ai', error)
    }
  }

  setFillSession(records)
  const unfilledCount = countUnfilled(controls, records)
  const unmatched = describeUnfilled(controls, records)
  await logSpesDebug(
    'autofill',
    `Filled ${records.length} on ${location.href}`,
    JSON.stringify(
      {
        frame: window === window.top ? 'top' : 'iframe',
        filled: records.map((record) => ({
          label: record.label,
          source: record.source,
          value: record.value,
        })),
        unmatched,
      },
      null,
      2,
    ),
  )
  if (records.length > 0) {
    showFillReview({ records, unfilledCount })
  }
  const extra =
    unfilledCount > 0 ? ` ${unfilledCount} left unfilled.` : ''
  const nested = collectIframes(document).length
  if (records.length === 0 && nested > 0) {
    setStatus('No fields matched here. Fill sent to embedded forms.')
    return
  }
  setStatus(
    records.length === 0
      ? `No confident matches.${extra}`
      : `Filled ${records.length} field${records.length === 1 ? '' : 's'}.${extra}`,
  )
}

async function copyLog(setStatus: (text: string) => void): Promise<void> {
  await copyDebugLog()
  setStatus('Debug log copied. Paste it in chat.')
}

const claimedFillTokens = new Set<string>()
let listeningForFill = false

function writePanelStatus(text: string): void {
  setSavePanelStatus(HOST_ID, text)
}

function relayFillToChildFrames(token: string): void {
  const payload = makeFillPageMessage(token)
  for (const iframe of collectIframes(document)) {
    try {
      iframe.contentWindow?.postMessage(payload, '*')
    } catch {
      // Cross-origin access to the window object still allows postMessage;
      // ignore frames that throw for other reasons.
    }
  }
}

function startFillRelay(token: string): void {
  relayFillToChildFrames(token)
  const started = Date.now()
  const retry = window.setInterval(() => {
    if (Date.now() - started > FILL_RELAY_MS) {
      window.clearInterval(retry)
      return
    }
    relayFillToChildFrames(token)
  }, FILL_RELAY_EVERY_MS)
}

function notifyTopFrame(token: string): void {
  const payload = makeFillPageMessage(token)
  try {
    window.top?.postMessage(payload, '*')
  } catch {
    window.postMessage(payload, '*')
  }
}

async function runFill(token: string, setStatus: (text: string) => void): Promise<void> {
  if (claimedFillTokens.has(token)) {
    return
  }
  claimedFillTokens.add(token)
  startFillRelay(token)
  try {
    await autofill(setStatus)
  } catch (error) {
    await logSpesError('autofill', error)
    setStatus(error instanceof Error ? error.message : 'Failed.')
  }
}

async function onFillPageMessage(event: MessageEvent): Promise<void> {
  const token = fillTokenFromEventData(event.data)
  if (!token || claimedFillTokens.has(token)) {
    return
  }
  try {
    const response = await send({ type: MSG_VERIFY_FILL, token })
    if (!response.ok) {
      return
    }
    await runFill(token, writePanelStatus)
  } catch (error) {
    await logSpesError('autofill-broadcast', error)
  }
}

async function startFillFromPanel(setStatus: (text: string) => void): Promise<void> {
  setStatus('Filling this page and embedded forms…')
  const response = await send({ type: MSG_BEGIN_FILL })
  if (!response.ok || !response.token) {
    throw new Error(response.ok ? 'Could not start fill.' : response.error)
  }
  const token = response.token
  const local = runFill(token, setStatus)
  notifyTopFrame(token)
  await local
}

function mountAutofillPanel(): void {
  if (document.getElementById(HOST_ID)) {
    return
  }
  mountSavePanel({
    hostId: HOST_ID,
    title: 'Spes',
    actionLabel: 'Auto-fill with Spes',
    secondaryLabel: 'Copy debug log',
    hint: 'Fills matching fields from your profile, including embedded forms. Review before you submit.',
    side: 'left',
    onAction: startFillFromPanel,
    onSecondary: copyLog,
  })
}

function watchForChildFrameFields(): void {
  if (window === window.top || document.getElementById(HOST_ID)) {
    return
  }
  const stopAt = Date.now() + 180_000
  const tryMount = (): boolean => {
    if (document.getElementById(HOST_ID)) {
      return true
    }
    if (collectControls(document).length === 0) {
      return false
    }
    mountAutofillPanel()
    return true
  }
  const observer = new MutationObserver(() => {
    if (tryMount()) {
      cleanup()
    }
  })
  const poll = window.setInterval(() => {
    if (Date.now() > stopAt || tryMount()) {
      cleanup()
    }
  }, 800)
  const cleanup = (): void => {
    observer.disconnect()
    window.clearInterval(poll)
  }
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  })
}

function startAutofillScript(): void {
  if (!listeningForFill) {
    listeningForFill = true
    window.addEventListener(
      'message',
      (event) => {
        void onFillPageMessage(event)
      },
      true,
    )
  }
  if (window === window.top || collectControls(document).length > 0) {
    mountAutofillPanel()
  }
  watchForChildFrameFields()
}

startAutofillScript()

console.debug('[spes] autofill content script loaded')
