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
        background: #fff;
        color: #1a1a1a;
        font: 13px/1.35 Segoe UI, system-ui, sans-serif;
        border: 1px solid #ccc;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,.18);
      }
      h1 { font-size: 13px; margin: 0 0 6px; }
      p { margin: 0 0 8px; color: #555; }
      button {
        width: 100%;
        border: 0;
        border-radius: 4px;
        background: #1a1a1a;
        color: #fff;
        padding: 8px;
        cursor: pointer;
        font: inherit;
      }
      button:disabled { opacity: .6; cursor: default; }
      .status { margin: 8px 0 0; color: #555; }
    </style>
    <div class="wrap">
      <h1>${options.title}</h1>
      <p>${options.hint}</p>
      <button type="button">${options.actionLabel}</button>
      <p class="status"></p>
    </div>
  `
  const button = root.querySelector('button')
  const status = root.querySelector('.status')
  if (!button || !status) {
    return
  }
  const setStatus = (text: string): void => {
    status.textContent = text
  }
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
