export function firstText(selectors: string[]): string {
  for (const selector of selectors) {
    const node = document.querySelector(selector)
    const text = normalizeText(node?.textContent ?? '')
    if (text) {
      return text
    }
  }
  return ''
}

export function firstInnerText(selectors: string[]): string {
  for (const selector of selectors) {
    const node = document.querySelector(selector)
    if (!(node instanceof HTMLElement)) {
      continue
    }
    const text = normalizeText(node.innerText)
    if (text) {
      return text
    }
  }
  return ''
}

export function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

export function metaContent(property: string): string {
  const node =
    document.querySelector(`meta[property="${property}"]`) ??
    document.querySelector(`meta[name="${property}"]`)
  return normalizeText(node?.getAttribute('content') ?? '')
}

export function visiblePageText(limit = 24_000): string {
  const selected = normalizeText(window.getSelection()?.toString() ?? '')
  if (selected) {
    return selected.slice(0, limit)
  }
  const root =
    document.querySelector('main') ??
    document.querySelector('article') ??
    document.querySelector('[role="main"]') ??
    document.body
  return normalizeText(root instanceof HTMLElement ? root.innerText : '').slice(
    0,
    limit,
  )
}

export function onSpaUrlChange(callback: () => void): void {
  let href = location.href
  const notify = (): void => {
    if (location.href === href) {
      return
    }
    href = location.href
    callback()
  }
  window.addEventListener('popstate', notify)
  const patched = window as Window & { __spesHistoryPatched?: boolean }
  if (!patched.__spesHistoryPatched) {
    patched.__spesHistoryPatched = true
    const push = history.pushState.bind(history)
    const replace = history.replaceState.bind(history)
    history.pushState = (...args) => {
      push(...args)
      notify()
    }
    history.replaceState = (...args) => {
      replace(...args)
      notify()
    }
  }
  window.setInterval(notify, 800)
}
