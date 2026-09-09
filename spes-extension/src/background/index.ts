import fallbackScript from '../content-scripts/generic-fallback?script'
import { emptyDraft, saveCaptureDraft, type CaptureDraft } from '../lib/capture'
import { auth, getOwnProfile } from '../lib/firebase'
import {
  extractJobFromText,
  generateApplicationDoc,
  parseProfileDump,
  pickSelectOption,
  fillUnmatchedFields,
} from '../lib/gemini'
import {
  MSG_EXTRACT_GENERIC,
  MSG_FILL_UNMATCHED,
  MSG_GENERATE_DOC,
  MSG_GET_PROFILE_FIELDS,
  MSG_INJECT_FALLBACK,
  MSG_MATCH_SELECT,
  MSG_PARSE_PROFILE,
  MSG_REMINDERS_REFRESH,
  MSG_SAVE_DRAFT,
  type ExtractGenericMessage,
  type FillUnmatchedMessage,
  type GenerateDocMessage,
  type InjectFallbackMessage,
  type MatchSelectMessage,
  type ParseProfileMessage,
  type SaveDraftMessage,
  type SpesRequest,
  type SpesResponse,
} from '../lib/messages'
import { emptyStructuredFields } from '../lib/profileFields'
import { logSpesError } from '../lib/autofill/debugLog'
import {
  openTrackerFromNotification,
  REMINDER_ALARM,
  runReminderPass,
  scheduleReminderAlarms,
} from '../lib/reminders'

chrome.runtime.onInstalled.addListener(() => {
  console.log('[spes] installed')
  void scheduleReminderAlarms()
  void runReminderPass()
})

chrome.runtime.onStartup.addListener(() => {
  void scheduleReminderAlarms()
  void runReminderPass()
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REMINDER_ALARM) {
    void runReminderPass()
  }
})

chrome.notifications.onClicked.addListener(() => {
  void openTrackerFromNotification()
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
          return
        }

        if (message.type === MSG_REMINDERS_REFRESH) {
          await runReminderPass()
          sendResponse({ ok: true })
          return
        }

        if (message.type === MSG_GENERATE_DOC) {
          const payload = message as GenerateDocMessage
          const text = await generateApplicationDoc({
            kind: payload.kind,
            title: payload.title,
            company: payload.company,
            description: payload.description,
            baseCV: payload.baseCV,
            reusableBullets: payload.reusableBullets,
          })
          sendResponse({ ok: true, text })
          return
        }

        if (message.type === MSG_PARSE_PROFILE) {
          const { rawDump } = message as ParseProfileMessage
          const structuredFields = await parseProfileDump(rawDump)
          sendResponse({ ok: true, structuredFields })
          return
        }

        if (message.type === MSG_GET_PROFILE_FIELDS) {
          const profile = await getOwnProfile()
          if (!auth.currentUser) {
            sendResponse({
              ok: false,
              error: 'Sign in via the Spes popup first.',
            })
            return
          }
          sendResponse({
            ok: true,
            structuredFields:
              profile?.structuredFields ?? emptyStructuredFields(),
            rawDump: profile?.rawDump ?? '',
          })
          return
        }

        if (message.type === MSG_MATCH_SELECT) {
          const payload = message as MatchSelectMessage
          try {
            const optionText = await pickSelectOption({
              label: payload.label,
              options: payload.options,
              profileContext: payload.profileContext,
              heuristicValue: payload.heuristicValue,
            })
            sendResponse({ ok: true, optionText: optionText ?? 'NONE' })
          } catch (error) {
            await logSpesError('match-select', error)
            sendResponse({ ok: true, optionText: 'NONE' })
          }
          return
        }

        if (message.type === MSG_FILL_UNMATCHED) {
          const payload = message as FillUnmatchedMessage
          try {
            const answers = await fillUnmatchedFields({
              fields: payload.fields,
              profileContext: payload.profileContext,
            })
            sendResponse({ ok: true, answers })
          } catch (error) {
            await logSpesError('fill-unmatched', error)
            sendResponse({ ok: true, answers: {} })
          }
          return
        }
      } catch (error) {
        await logSpesError('background', error)
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Request failed.',
        })
      }
    })()
    return true
  },
)
