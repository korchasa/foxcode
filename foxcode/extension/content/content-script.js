/**
 * FoxCode - Content script.
 * Handles EVAL_IN_PAGE requests from background script.
 * Uses Firefox wrappedJSObject for page main world access.
 */

browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.action) {
    case 'EVAL_IN_PAGE': {
      try {
        const result = window.wrappedJSObject.eval(msg.expression)
        const safe = JSON.parse(JSON.stringify(result))
        sendResponse({ ok: true, result: safe })
      } catch (e) {
        sendResponse({ ok: false, error: e.message })
      }
      break
    }
  }
  return false
})
