/**
 * FoxCode - Port resolution from browser tab URL.
 * Reads foxcode-port from URL hash of any open tab.
 * Used with: web-ext run --start-url "about:blank#foxcode-port=PORT"
 */

/**
 * Parse foxcode-port value from URL hash fragment.
 * @param {string} url - Full URL string
 * @returns {number|null} Port number or null if not found/invalid
 */
function parseFoxcodePort(url) {
  if (!url || typeof url !== 'string') return null
  try {
    const hashIndex = url.indexOf('#')
    if (hashIndex === -1) return null
    const hash = url.slice(hashIndex + 1)
    const params = new URLSearchParams(hash)
    const raw = params.get('foxcode-port')
    if (!raw) return null
    const port = parseInt(raw, 10)
    if (isNaN(port) || port < 1 || port > 65535) return null
    return port
  } catch {
    return null
  }
}

/**
 * Query all open tabs for one with #foxcode-port=NNNN in URL.
 * @param {function} queryTabs - browser.tabs.query({}) wrapper
 * @returns {Promise<number|null>} Port number or null
 */
async function getPortFromTabs(queryTabs) {
  try {
    const tabs = await queryTabs()
    for (const tab of tabs) {
      const port = parseFoxcodePort(tab.url)
      if (port) return port
    }
  } catch {
    // tabs API unavailable or permission denied
  }
  return null
}

// Export for Node.js test runner, no-op in browser
if (typeof module !== 'undefined') module.exports = { parseFoxcodePort, getPortFromTabs }
