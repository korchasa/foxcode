/**
 * Validate JS code syntax for evalInBrowser.
 * Wraps in async function with `api` parameter to allow top-level await.
 */
export function validateCode(code) {
  try {
    new Function('api', `return (async () => { ${code} })()`)
    return { valid: true }
  } catch (e) {
    return { valid: false, error: e.message }
  }
}
