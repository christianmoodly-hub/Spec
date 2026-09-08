export function mountSavePanel(options: {
  hostId: string
  title: string
  actionLabel: string
  hint: string
  onAction: (setStatus: (text: string) => void) => Promise<void>
}): void {
  let host = document.getElementById(options.hostId)
  if (!host) {
    host = document.createElement('div')
    host.id = options.hostId
    host.style.all = 'initial'
    document.documentElement.append(host)
  }
  const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .wrap {
        position: fixed;
        right: 16px;
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
      button.action:disabled { opacity: .6; cursor: default; }
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
      <p class="status"></p>
    </div>
  `
  const button = root.querySelector<HTMLButtonElement>('button.action')
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
  button.addEventListener('click', () => {
    void (async () => {
      button.disabled = true
      setStatus('')
      try {
        await options.onAction(setStatus)
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed.')
      } finally {
        button.disabled = false
      }
    })()
  })
}
