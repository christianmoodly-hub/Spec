import type { CaptureDraft } from './capture'

export const MSG_SAVE_DRAFT = 'SPES_SAVE_DRAFT'
export const MSG_EXTRACT_GENERIC = 'SPES_EXTRACT_GENERIC'
export const MSG_INJECT_FALLBACK = 'SPES_INJECT_FALLBACK'
export const MSG_PARSE_PAGE = 'SPES_PARSE_PAGE'

export type SaveDraftMessage = {
  type: typeof MSG_SAVE_DRAFT
  draft: CaptureDraft
}

export type ExtractGenericMessage = {
  type: typeof MSG_EXTRACT_GENERIC
  text: string
  url: string
}

export type InjectFallbackMessage = {
  type: typeof MSG_INJECT_FALLBACK
  tabId: number
}

export type ParsePageMessage = {
  type: typeof MSG_PARSE_PAGE
}

export type SpesRequest =
  | SaveDraftMessage
  | ExtractGenericMessage
  | InjectFallbackMessage
  | ParsePageMessage

export type SpesResponse =
  | { ok: true; draft?: CaptureDraft }
  | { ok: false; error: string }
