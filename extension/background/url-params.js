/**
 * FoxCode - Connection params resolution from browser tab URL.
 * Reads foxcode-port and foxcode-password from URL hash of any open tab.
 * Used with: web-ext run --start-url "about:blank#foxcode-port=PORT&foxcode-password=PASS"
 */

/**
 * Parse foxcode-port and foxcode-password from URL hash fragment.
 * @param {string} url - Full URL string
 * @returns {{port: number|null, password: string|null}}
 */
function parseFoxcodeParams(url) {
  if (!url || typeof url !== 'string') return { port: null, password: null }
  try {
    const hashIndex = url.indexOf('#')
    if (hashIndex === -1) return { port: null, password: null }
    const hash = url.slice(hashIndex + 1)
    const params = new URLSearchParams(hash)
    const rawPort = params.get('foxcode-port')
    const rawPassword = params.get('foxcode-password')
    let port = null
    if (rawPort) {
      const n = parseInt(rawPort, 10)
      if (!isNaN(n) && n >= 1 && n <= 65535) port = n
    }
    const password = rawPassword || null
    return { port, password }
  } catch {
    return { port: null, password: null }
  }
}

/**
 * Query all open tabs for one with #foxcode-port=NNNN in URL.
 * @param {function} queryTabs - browser.tabs.query({}) wrapper
 * @returns {Promise<{port: number, password: string}|null>} Params or null
 */
async function getParamsFromTabs(queryTabs) {
  try {
    const tabs = await queryTabs()
    for (const tab of tabs) {
      const { port, password } = parseFoxcodeParams(tab.url)
      if (port) return { port, password }
    }
  } catch {
    // tabs API unavailable or permission denied
  }
  return null
}

// Export for Node.js test runner, no-op in browser
if (typeof module !== 'undefined') module.exports = { parseFoxcodeParams, getParamsFromTabs }
