import {
  MSG_EXTRACT_GENERIC,
  type ExtractGenericMessage,
  type SpesResponse,
} from '../lib/messages'
import { visiblePageText } from './dom'
import { mountSavePanel } from './savePanel'

function extract(): Promise<void> {
  const text = visiblePageText()
  if (!text) {
    return Promise.reject(new Error('No text selected and no page text found.'))
  }
  const message: ExtractGenericMessage = {
    type: MSG_EXTRACT_GENERIC,
    text,
    url: location.href,
  }
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: SpesResponse) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      if (!response?.ok) {
        reject(new Error(response?.error ?? 'Gemini extraction failed.'))
        return
      }
      resolve()
    })
  })
}

mountSavePanel({
  hostId: 'spes-fallback-root',
  title: 'Spes',
  actionLabel: 'Extract with Gemini',
  hint: 'Highlight the job text first. If nothing is selected, the main visible text is used. Nothing is saved until you review it.',
  onAction: async (setStatus) => {
    setStatus('Extracting…')
    await extract()
    setStatus('Opened. Review and save in Spes.')
  },
})

console.debug('[spes] generic fallback content script loaded')
