/**
 * FoxCode - Formatting helpers for popup display.
 * Pure functions, no DOM dependencies.
 */

function formatParamValue(v) {
  if (typeof v === 'string') return `"${v}"`
  if (typeof v === 'object') return JSON.stringify(v, null, 2)
  return String(v)
}

function formatToolParams(params) {
  if (!params || Object.keys(params).length === 0) return ''
  return Object.entries(params)
    .map(([k, v]) => `${k}: ${formatParamValue(v)}`)
    .join(', ')
}

// Export for Node.js test runner, no-op in browser
if (typeof module !== 'undefined') module.exports = { formatParamValue, formatToolParams }
