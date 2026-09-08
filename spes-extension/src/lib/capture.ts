import type { ApplicationStatus, NewApplication } from '../types'

export const DRAFT_STORAGE_KEY = 'spesDraft'

export type CaptureSource = 'linkedin' | 'indeed' | 'generic'

export interface CaptureDraft extends NewApplication {
  source: CaptureSource
}

export function emptyDraft(
  partial: Partial<CaptureDraft> & Pick<CaptureDraft, 'source' | 'url'>,
): CaptureDraft {
  return {
    title: partial.title ?? '',
    company: partial.company ?? '',
    url: partial.url,
    description: partial.description ?? '',
    dueDate: partial.dueDate ?? null,
    notes: partial.notes ?? '',
    status: (partial.status as ApplicationStatus | undefined) ?? 'to-apply',
    source: partial.source,
  }
}

function store(): chrome.storage.StorageArea {
  return chrome.storage.session ?? chrome.storage.local
}

export async function saveCaptureDraft(draft: CaptureDraft): Promise<void> {
  await store().set({ [DRAFT_STORAGE_KEY]: draft })
}

export async function readCaptureDraft(): Promise<CaptureDraft | null> {
  const result = await store().get(DRAFT_STORAGE_KEY)
  const draft = result[DRAFT_STORAGE_KEY] as CaptureDraft | undefined
  return draft ?? null
}

export async function clearCaptureDraft(): Promise<void> {
  await store().remove(DRAFT_STORAGE_KEY)
}
