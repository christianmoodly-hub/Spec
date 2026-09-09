import type { ProfileStructuredFields } from '../types'
import type { CaptureDraft } from './capture'

export type UnmatchedFormField = {
  id: string
  label: string
  type: string
  options?: string[]
}

export const MSG_SAVE_DRAFT = 'SPES_SAVE_DRAFT'
export const MSG_EXTRACT_GENERIC = 'SPES_EXTRACT_GENERIC'
export const MSG_INJECT_FALLBACK = 'SPES_INJECT_FALLBACK'
export const MSG_PARSE_PAGE = 'SPES_PARSE_PAGE'
export const MSG_REMINDERS_REFRESH = 'SPES_REMINDERS_REFRESH'
export const MSG_GENERATE_DOC = 'SPES_GENERATE_DOC'
export const MSG_PARSE_PROFILE = 'SPES_PARSE_PROFILE'
export const MSG_GET_PROFILE_FIELDS = 'SPES_GET_PROFILE_FIELDS'
export const MSG_MATCH_SELECT = 'SPES_MATCH_SELECT'
export const MSG_FILL_UNMATCHED = 'SPES_FILL_UNMATCHED'
export const MSG_BEGIN_FILL = 'SPES_BEGIN_FILL'
export const MSG_VERIFY_FILL = 'SPES_VERIFY_FILL'

export const FILL_PAGE_CHANNEL = 'spes-autofill'
export const FILL_PAGE_KIND = 'run-fill'

export type GenerateKind = 'cv' | 'cover-letter'

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

export type RemindersRefreshMessage = {
  type: typeof MSG_REMINDERS_REFRESH
}

export type GenerateDocMessage = {
  type: typeof MSG_GENERATE_DOC
  kind: GenerateKind
  title: string
  company: string
  description: string
  baseCV: string
  reusableBullets: string[]
}

export type ParseProfileMessage = {
  type: typeof MSG_PARSE_PROFILE
  rawDump: string
}

export type GetProfileFieldsMessage = {
  type: typeof MSG_GET_PROFILE_FIELDS
}

export type MatchSelectMessage = {
  type: typeof MSG_MATCH_SELECT
  label: string
  options: string[]
  profileContext: string
  heuristicValue?: string
}

export type FillUnmatchedMessage = {
  type: typeof MSG_FILL_UNMATCHED
  fields: UnmatchedFormField[]
  profileContext: string
}

export type BeginFillMessage = {
  type: typeof MSG_BEGIN_FILL
}

export type VerifyFillMessage = {
  type: typeof MSG_VERIFY_FILL
  token: string
}

export type FillPageMessage = {
  channel: typeof FILL_PAGE_CHANNEL
  kind: typeof FILL_PAGE_KIND
  token: string
}

export type SpesRequest =
  | SaveDraftMessage
  | ExtractGenericMessage
  | InjectFallbackMessage
  | ParsePageMessage
  | RemindersRefreshMessage
  | GenerateDocMessage
  | ParseProfileMessage
  | GetProfileFieldsMessage
  | MatchSelectMessage
  | FillUnmatchedMessage
  | BeginFillMessage
  | VerifyFillMessage

export type SpesResponse =
  | {
      ok: true
      draft?: CaptureDraft
      text?: string
      structuredFields?: ProfileStructuredFields
      rawDump?: string
      optionText?: string
      answers?: Record<string, string>
      token?: string
    }
  | { ok: false; error: string }
