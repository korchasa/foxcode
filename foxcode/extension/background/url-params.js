/**
 * FoxCode - Connection params resolution from browser tab URL.
 * Reads connection params from URL hash of any open tab.
 * Format: about:blank#PORT:PASSWORD (or just #PORT without password)
 */

/**
 * Parse foxcode connection params from URL hash fragment.
 * Format: #PORT:PASSWORD (password optional: #PORT)
 * Port must be in range 8787–8886 (FoxCode port range) to avoid false positives.
 * SYNC: range must match BASE_PORT/PORT_RANGE in foxcode/channel/lib.mjs
 * @param {string} url - Full URL string
 * @returns {{port: number|null, password: string|null}}
 */
function parseFoxcodeParams(url) {
  if (!url || typeof url !== 'string') return { port: null, password: null }
  try {
    const hashIndex = url.indexOf('#')
    if (hashIndex === -1) return { port: null, password: null }
    const hash = url.slice(hashIndex + 1)
    if (!hash) return { port: null, password: null }
    const colonIndex = hash.indexOf(':')
    const rawPort = colonIndex === -1 ? hash : hash.slice(0, colonIndex)
    const rawPassword = colonIndex === -1 ? null : hash.slice(colonIndex + 1)
    let port = null
    const n = parseInt(rawPort, 10)
    if (!isNaN(n) && n >= 8787 && n <= 8886) port = n
    const password = rawPassword || null
    return { port, password }
  } catch {
    return { port: null, password: null }
  }
}

/**
 * Query all open tabs for foxcode connection params in URL hash.
 * Returns all matches (deduplicated by port), not just the first.
 * @param {function} queryTabs - browser.tabs.query({}) wrapper
 * @returns {Promise<Array<{port: number, password: string|null}>>}
 */
async function getParamsFromTabs(queryTabs) {
  try {
    const tabs = await queryTabs()
    const seen = new Set()
    const results = []
    for (const tab of tabs) {
      const { port, password } = parseFoxcodeParams(tab.url)
      if (port && !seen.has(port)) {
        seen.add(port)
        results.push({ port, password })
      }
    }
    return results
  } catch {
    return []
  }
}

// Export for Node.js test runner, no-op in browser
if (typeof module !== 'undefined') module.exports = { parseFoxcodeParams, getParamsFromTabs }
