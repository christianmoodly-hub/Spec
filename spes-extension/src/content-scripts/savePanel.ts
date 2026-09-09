import { logSpesError } from '../lib/autofill/debugLog'

export function mountSavePanel(options: {
  hostId: string
  title: string
  actionLabel: string
  hint: string
  side?: 'left' | 'right'
  secondaryLabel?: string
  onAction: (setStatus: (text: string) => void) => Promise<void>
  onSecondary?: (setStatus: (text: string) => void) => Promise<void>
}): void {
  let host = document.getElementById(options.hostId)
  if (!host) {
    host = document.createElement('div')
    host.id = options.hostId
    host.style.all = 'initial'
    document.documentElement.append(host)
  }
  const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
  const side = options.side === 'left' ? 'left' : 'right'
  const secondary = options.secondaryLabel
    ? `<button type="button" class="secondary">${options.secondaryLabel}</button>`
    : ''
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .wrap {
        position: fixed;
        ${side}: 16px;
        bottom: 16px;
        z-index: 2147483646;
        width: 220px;
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
      button.action {
        width: 100%;
        border: 0;
        border-radius: 4px;
        background: #e11d74;
        color: #fff;
        padding: 8px;
        cursor: pointer;
        font: inherit;
      }
      button.action:disabled,
      button.secondary:disabled { opacity: .6; cursor: default; }
      button.secondary {
        width: 100%;
        margin-top: 6px;
        border: 1px solid #f5b8cc;
        border-radius: 4px;
        background: #fff;
        color: #9a4d6e;
        padding: 6px;
        cursor: pointer;
        font: inherit;
      }
      button.close {
        background: transparent;
        border: 0;
        color: #9a4d6e;
        cursor: pointer;
        flex-shrink: 0;
        font: 16px/1 Segoe UI, system-ui, sans-serif;
        padding: 0 2px;
      }
      .status { margin: 8px 0 0; color: #9a4d6e; }
    </style>
    <div class="wrap">
      <div class="head">
        <h1>${options.title}</h1>
        <button type="button" class="close" aria-label="Close">×</button>
      </div>
      <p>${options.hint}</p>
      <button type="button" class="action">${options.actionLabel}</button>
      ${secondary}
      <p class="status"></p>
    </div>
  `
  const button = root.querySelector<HTMLButtonElement>('button.action')
  const extra = root.querySelector<HTMLButtonElement>('button.secondary')
  const close = root.querySelector<HTMLButtonElement>('button.close')
  const status = root.querySelector('.status')
  if (!button || !close || !status) {
    return
  }
  const setStatus = (text: string): void => {
    status.textContent = text
  }
  close.addEventListener('click', () => {
    host.remove()
  })
  bindAction(button, extra, setStatus, options.onAction)
  if (extra && options.onSecondary) {
    bindAction(extra, button, setStatus, options.onSecondary)
  }
}

function bindAction(
  button: HTMLButtonElement,
  other: HTMLButtonElement | null,
  setStatus: (text: string) => void,
  run: (setStatus: (text: string) => void) => Promise<void>,
): void {
  button.addEventListener('click', () => {
    void (async () => {
      button.disabled = true
      if (other) {
        other.disabled = true
      }
      setStatus('')
      try {
        await run(setStatus)
      } catch (error) {
        await logSpesError('panel', error)
        setStatus(error instanceof Error ? error.message : 'Failed.')
      } finally {
        button.disabled = false
        if (other) {
          other.disabled = false
        }
      }
    })()
  })
}
