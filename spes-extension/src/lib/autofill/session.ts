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

let session: FillSession | null = null

export function setFillSession(records: FillRecord[]): FillSession {
  session = {
    records,
    startedAt: new Date().toISOString(),
  }
  return session
}

export function getFillSession(): FillSession | null {
  return session
}
