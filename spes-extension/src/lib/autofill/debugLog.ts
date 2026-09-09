const STORAGE_KEY = 'spesDebugLog'
const MAX_ENTRIES = 20

export interface DebugEntry {
  at: string
  source: string
  message: string
  detail?: string
}

export async function logSpesDebug(
  source: string,
  message: string,
  detail?: string,
): Promise<void> {
  const entry: DebugEntry = {
    at: new Date().toISOString(),
    source,
    message,
    ...(detail ? { detail: detail.slice(0, 8_000) } : {}),
  }
  try {
    const current = await readSpesDebug()
    const next = [entry, ...current].slice(0, MAX_ENTRIES)
    await chrome.storage.local.set({ [STORAGE_KEY]: next })
  } catch {
    console.warn('[spes]', source, message, detail ?? '')
  }
}

export async function logSpesError(
  source: string,
  error: unknown,
): Promise<void> {
  const message =
    error instanceof Error ? error.message : String(error ?? 'Unknown error')
  const detail = error instanceof Error && error.stack ? error.stack : undefined
  await logSpesDebug(source, message, detail)
}

export async function readSpesDebug(): Promise<DebugEntry[]> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY)
    const value = stored[STORAGE_KEY]
    return Array.isArray(value) ? (value as DebugEntry[]) : []
  } catch {
    return []
  }
}

export async function formatSpesDebugLog(): Promise<string> {
  const entries = await readSpesDebug()
  if (entries.length === 0) {
    return 'No Spes debug entries yet. Run Auto-fill, then copy again.'
  }
  return entries
    .map((entry) => {
      const lines = [`[${entry.at}] ${entry.source}: ${entry.message}`]
      if (entry.detail) {
        lines.push(entry.detail)
      }
      return lines.join('\n')
    })
    .join('\n\n')
}
