/**
 * FoxCode — Result serializer for tool responses.
 * Converts JS values to string representation for MCP transport.
 * Strings pass through unchanged; objects are JSON-serialized.
 */

function serializeResult(value) {
  if (value === null || value === undefined) return String(value)
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, (_key, val) => {
      if (typeof val === 'function') return '[Function]'
      if (val === undefined) return '[undefined]'
      return val
    })
  } catch {
    return String(value)
  }
}

// Export for Node.js test runner, no-op in browser
if (typeof module !== 'undefined') module.exports = { serializeResult }
