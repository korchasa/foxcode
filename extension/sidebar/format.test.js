const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { formatParamValue, formatToolParams } = require('./format.js')

describe('formatParamValue', () => {
  it('wraps strings in quotes without JSON escaping', () => {
    const result = formatParamValue('await api.navigate("https://example.com");\nreturn await api.snapshot();\n')
    assert.ok(!result.includes('\\n'), 'should not contain literal \\n')
    assert.ok(!result.includes('\\"'), 'should not contain \\"')
    assert.ok(result.includes('https://example.com'))
    assert.ok(result.startsWith('"'))
    assert.ok(result.endsWith('"'))
  })

  it('formats numbers as strings', () => {
    assert.equal(formatParamValue(42), '42')
  })

  it('formats booleans as strings', () => {
    assert.equal(formatParamValue(true), 'true')
  })

  it('formats objects as pretty JSON', () => {
    const result = formatParamValue({ a: 1 })
    assert.ok(result.includes('"a": 1'))
  })
})

describe('formatToolParams', () => {
  it('returns empty string for null/undefined', () => {
    assert.equal(formatToolParams(null), '')
    assert.equal(formatToolParams(undefined), '')
  })

  it('returns empty string for empty object', () => {
    assert.equal(formatToolParams({}), '')
  })

  it('formats single string param without JSON escaping', () => {
    const result = formatToolParams({ code: 'hello\nworld' })
    assert.ok(!result.includes('\\n'), 'should not contain literal \\n')
    assert.ok(result.startsWith('code: "'))
  })

  it('formats multiple params joined by comma', () => {
    const result = formatToolParams({ a: 'x', b: 42 })
    assert.equal(result, 'a: "x", b: 42')
  })
})
