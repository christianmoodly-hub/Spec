import type { FillRecord, FillSource } from '../lib/autofill/session'

const REVIEW_HOST_ID = 'spes-fill-review-root'
const SOURCE_ATTR = 'data-spes-fill-source'
const SAVED_ATTR = 'data-spes-fill-saved'

const HEURISTIC = {
  outline: '2px solid #e11d74',
  background: 'rgba(225, 29, 116, 0.12)',
}

const AI = {
  outline: '2px solid #d97706',
  background: 'rgba(217, 119, 6, 0.18)',
}

type SavedInline = {
  outline: string
  outlineOffset: string
  background: string
  title: string
}

const highlighted = new Set<HTMLElement>()
let fadeTimer = 0

export function applyFillHighlights(records: FillRecord[]): void {
  clearFillHighlights()
  for (const record of records) {
    highlightField(record.element, record.source)
  }
  window.clearTimeout(fadeTimer)
  fadeTimer = window.setTimeout(() => {
    for (const el of highlighted) {
      if (!el.isConnected) {
        continue
      }
      el.style.setProperty('outline-width', '1px', 'important')
      el.style.setProperty('background-color', 'transparent', 'important')
    }
  }, 16_000)
}

export function clearFillHighlights(): void {
  window.clearTimeout(fadeTimer)
  fadeTimer = 0
  for (const el of highlighted) {
    restoreField(el)
  }
  highlighted.clear()
}

export function dismissFillReview(): void {
  clearFillHighlights()
  document.getElementById(REVIEW_HOST_ID)?.remove()
}

export function showFillReview(options: {
  records: FillRecord[]
  unfilledCount: number
}): void {
  document.getElementById(REVIEW_HOST_ID)?.remove()
  applyFillHighlights(options.records)

  const heuristic = options.records.filter(
    (record) => record.source === 'heuristic',
  ).length
  const ai = options.records.length - heuristic
  const filled = options.records.length
  const unfilled = options.unfilledCount

  const host = document.createElement('div')
  host.id = REVIEW_HOST_ID
  host.style.all = 'initial'
  document.documentElement.append(host)
  const root = host.attachShadow({ mode: 'open' })
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .wrap {
        position: fixed;
        left: 16px;
        bottom: 170px;
        z-index: 2147483647;
        width: 250px;
        max-height: min(42vh, 360px);
        display: flex;
        flex-direction: column;
        padding: 12px;
        background: #fff4f7;
        color: #4a1830;
        font: 13px/1.35 Segoe UI, system-ui, sans-serif;
        border: 1px solid #f5b8cc;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(225, 29, 116, .18);
      }
      .head {
        align-items: flex-start;
        display: flex;
        gap: 8px;
        justify-content: space-between;
      }
      h1 { font-size: 13px; margin: 0 0 6px; }
      p { margin: 0 0 8px; color: #9a4d6e; }
      button.close {
        background: transparent;
        border: 0;
        color: #9a4d6e;
        cursor: pointer;
        flex-shrink: 0;
        font: 16px/1 Segoe UI, system-ui, sans-serif;
        padding: 0 2px;
      }
      button.dismiss {
        width: 100%;
        margin-top: 8px;
        border: 0;
        border-radius: 4px;
        background: #e11d74;
        color: #fff;
        padding: 8px;
        cursor: pointer;
        font: inherit;
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
        overflow: auto;
        min-height: 0;
      }
      li { margin: 0 0 4px; }
      button.jump {
        align-items: center;
        background: #fff;
        border: 1px solid #f5b8cc;
        border-radius: 4px;
        color: #4a1830;
        cursor: pointer;
        display: flex;
        font: inherit;
        gap: 6px;
        padding: 6px 8px;
        text-align: left;
        width: 100%;
      }
      .tag {
        border-radius: 3px;
        color: #fff;
        flex-shrink: 0;
        font-size: 10px;
        letter-spacing: 0.02em;
        padding: 1px 5px;
        text-transform: uppercase;
      }
      .tag.heuristic { background: #e11d74; }
      .tag.ai { background: #d97706; }
      .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .note { font-size: 12px; margin: 0; }
    </style>
    <div class="wrap">
      <div class="head">
        <h1>Review fill</h1>
        <button type="button" class="close" aria-label="Dismiss">×</button>
      </div>
      <p>
        Filled ${filled} field${filled === 1 ? '' : 's'}
        (${heuristic} heuristic, ${ai} AI-assisted).
        ${unfilled} field${unfilled === 1 ? '' : 's'} left unfilled.
      </p>
      <p class="note">Spes never submits. Check highlighted fields, then use the site’s submit button.</p>
      <ul></ul>
      <button type="button" class="dismiss">Dismiss highlights</button>
    </div>
  `

  const list = root.querySelector('ul')
  const close = root.querySelector<HTMLButtonElement>('button.close')
  const dismiss = root.querySelector<HTMLButtonElement>('button.dismiss')
  if (!list || !close || !dismiss) {
    return
  }

  for (const record of options.records) {
    const item = document.createElement('li')
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'jump'
    const tag = document.createElement('span')
    tag.className = `tag ${record.source}`
    tag.textContent = record.source === 'ai' ? 'AI' : 'Match'
    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = fieldCaption(record)
    name.title = record.label || record.value
    button.append(tag, name)
    button.addEventListener('click', () => {
      revealField(record.element)
    })
    item.append(button)
    list.append(item)
  }

  const onDismiss = (): void => {
    dismissFillReview()
  }
  close.addEventListener('click', onDismiss)
  dismiss.addEventListener('click', onDismiss)
}

function fieldCaption(record: FillRecord): string {
  const label = record.label.trim()
  if (label) {
    return label.length > 48 ? `${label.slice(0, 47)}…` : label
  }
  const value = record.value.trim()
  if (value) {
    return value.length > 48 ? `${value.slice(0, 47)}…` : value
  }
  return 'Untitled field'
}

function highlightField(el: HTMLElement, source: FillSource): void {
  if (!el.isConnected) {
    return
  }
  saveInline(el)
  const colors = source === 'ai' ? AI : HEURISTIC
  el.style.setProperty('outline', colors.outline, 'important')
  el.style.setProperty('outline-offset', '2px', 'important')
  el.style.setProperty('background-color', colors.background, 'important')
  el.setAttribute(SOURCE_ATTR, source)
  el.title =
    source === 'ai'
      ? 'Spes AI match — double-check this field'
      : 'Spes heuristic match'
  highlighted.add(el)
}

function revealField(el: HTMLElement): void {
  if (!el.isConnected) {
    return
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
  try {
    el.focus({ preventScroll: true })
  } catch {
    el.focus()
  }
  const source = (el.getAttribute(SOURCE_ATTR) as FillSource | null) ?? 'heuristic'
  const base = source === 'ai' ? AI.outline : HEURISTIC.outline
  el.animate(
    [
      { outline: base, outlineWidth: '2px' },
      { outlineWidth: '6px', offset: 0.45 },
      { outline: base, outlineWidth: '2px' },
    ],
    { duration: 700, easing: 'ease-out' },
  )
}

function saveInline(el: HTMLElement): void {
  if (el.hasAttribute(SAVED_ATTR)) {
    return
  }
  const saved: SavedInline = {
    outline: el.style.outline,
    outlineOffset: el.style.outlineOffset,
    background: el.style.backgroundColor,
    title: el.getAttribute('title') ?? '',
  }
  el.setAttribute(SAVED_ATTR, JSON.stringify(saved))
}

function restoreField(el: HTMLElement): void {
  const raw = el.getAttribute(SAVED_ATTR)
  el.removeAttribute(SOURCE_ATTR)
  el.removeAttribute(SAVED_ATTR)
  let saved: SavedInline | null = null
  if (raw) {
    try {
      saved = JSON.parse(raw) as SavedInline
    } catch {
      saved = null
    }
  }
  if (!saved) {
    el.style.removeProperty('outline')
    el.style.removeProperty('outline-offset')
    el.style.removeProperty('background-color')
    if (el.title.startsWith('Spes ')) {
      el.removeAttribute('title')
    }
    return
  }
  el.style.outline = saved.outline
  el.style.outlineOffset = saved.outlineOffset
  el.style.backgroundColor = saved.background
  if (saved.title) {
    el.title = saved.title
  } else {
    el.removeAttribute('title')
  }
}
