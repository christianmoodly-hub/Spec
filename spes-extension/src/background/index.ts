import fallbackScript from '../content-scripts/generic-fallback?script'
import { emptyDraft, saveCaptureDraft, type CaptureDraft } from '../lib/capture'
import { extractJobFromText } from '../lib/gemini'
import {
  MSG_EXTRACT_GENERIC,
  MSG_INJECT_FALLBACK,
  MSG_SAVE_DRAFT,
  type ExtractGenericMessage,
  type InjectFallbackMessage,
  type SaveDraftMessage,
  type SpesRequest,
  type SpesResponse,
} from '../lib/messages'

chrome.runtime.onInstalled.addListener(() => {
  console.log('[spes] installed')
})

export async function injectFallbackScript(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [fallbackScript],
  })
}

async function openReviewUi(): Promise<void> {
  try {
    await chrome.action.openPopup()
  } catch {
    const url = `${chrome.runtime.getURL('src/popup/index.html')}?review=1`
    await chrome.windows.create({
      url,
      type: 'popup',
      width: 420,
      height: 680,
      focused: true,
    })
  }
}

async function stashAndOpen(draft: CaptureDraft): Promise<void> {
  await saveCaptureDraft(draft)
  await openReviewUi()
}

chrome.runtime.onMessage.addListener(
  (message: SpesRequest, _sender, sendResponse: (response: SpesResponse) => void) => {
    void (async () => {
      try {
        if (message.type === MSG_SAVE_DRAFT) {
          const { draft } = message as SaveDraftMessage
          await stashAndOpen(draft)
          sendResponse({ ok: true })
          return
        }

        if (message.type === MSG_EXTRACT_GENERIC) {
          const { text, url } = message as ExtractGenericMessage
          const extracted = await extractJobFromText(text, url)
          const draft = emptyDraft({
            source: 'generic',
            url,
            title: extracted.title,
            company: extracted.company,
            description: extracted.description,
            dueDate: extracted.dueDate,
          })
          await stashAndOpen(draft)
          sendResponse({ ok: true, draft })
          return
        }

        if (message.type === MSG_INJECT_FALLBACK) {
          const { tabId } = message as InjectFallbackMessage
          await injectFallbackScript(tabId)
          sendResponse({ ok: true })
        }
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Capture failed.',
        })
      }
    })()
    return true
  },
)
