import {
  MSG_PARSE_PAGE,
  MSG_SAVE_DRAFT,
  type SpesRequest,
  type SpesResponse,
} from '../lib/messages'
import { onSpaUrlChange } from './dom'
import { isLinkedInJobPage, parseLinkedInJob } from './parseLinkedIn'
import { mountSavePanel } from './savePanel'

function sendDraft(): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: MSG_SAVE_DRAFT, draft: parseLinkedInJob() },
      (response: SpesResponse) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        if (!response?.ok) {
          reject(new Error(response?.error ?? 'Could not open Spes.'))
          return
        }
        resolve()
      },
    )
  })
}

function mount(): void {
  if (!isLinkedInJobPage()) {
    document.getElementById('spes-linkedin-root')?.remove()
    return
  }
  mountSavePanel({
    hostId: 'spes-linkedin-root',
    title: 'Spes',
    actionLabel: 'Save to Spes',
    hint: 'Review the extracted job in Spes before it is saved.',
    onAction: async (setStatus) => {
      setStatus('Opening review form…')
      await sendDraft()
      setStatus('Opened. Review and save in Spes.')
    },
  })
}

chrome.runtime.onMessage.addListener(
  (message: SpesRequest, _sender, sendResponse: (response: SpesResponse) => void) => {
    if (message.type !== MSG_PARSE_PAGE) {
      return
    }
    sendResponse({ ok: true, draft: parseLinkedInJob() })
  },
)

mount()
onSpaUrlChange(mount)
console.debug('[spes] linkedin content script loaded')
