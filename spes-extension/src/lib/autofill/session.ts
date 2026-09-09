export type FillSource = 'heuristic' | 'ai'

export interface FillRecord {
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  label: string
  value: string
  previousValue: string
  source: FillSource
}

export interface FillSession {
  records: FillRecord[]
  startedAt: string
}

export const SPES_FILL_SESSION_KEY = '__spesFillSession'

let session: FillSession | null = null

export function setFillSession(records: FillRecord[]): FillSession {
  session = {
    records,
    startedAt: new Date().toISOString(),
  }
  ;(window as unknown as Record<string, FillSession | undefined>)[
    SPES_FILL_SESSION_KEY
  ] = session
  return session
}

export function getFillSession(): FillSession | null {
  return session
}
