import fallbackScript from '../content-scripts/fallback?script'

chrome.runtime.onInstalled.addListener(() => {
  console.log('[spes] installed')
})

/**
 * Injects the generic fallback content script into the tab the user just
 * invoked the extension on (activeTab + scripting). Not used by the UI yet.
 */
export async function injectFallbackScript(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [fallbackScript],
  })
}
