const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { serializeResult } = require('./serialize.js')

describe('serializeResult', () => {
  it('returns string values unchanged (no JSON escaping)', () => {
    const input = '# Page Title\nURL: https://example.com\n\nContent here'
    const result = serializeResult(input)
    assert.equal(result, input)
    assert.ok(!result.includes('\\n'), 'should not contain literal \\n')
    assert.ok(!result.startsWith('"'), 'should not wrap in quotes')
  })

  it('returns "null" for null', () => {
    assert.equal(serializeResult(null), 'null')
  })

  it('returns "undefined" for undefined', () => {
    assert.equal(serializeResult(undefined), 'undefined')
  })

  it('serializes objects as JSON', () => {
    const result = serializeResult({ ok: true, data: [1, 2] })
    assert.equal(result, '{"ok":true,"data":[1,2]}')
  })

  it('serializes numbers', () => {
    assert.equal(serializeResult(42), '42')
  })

  it('serializes booleans', () => {
    assert.equal(serializeResult(true), 'true')
  })

  it('replaces functions with [Function]', () => {
    const result = serializeResult({ fn: () => {} })
    assert.ok(result.includes('[Function]'))
  })

  it('replaces undefined values with [undefined]', () => {
    const result = serializeResult({ a: undefined })
    assert.ok(result.includes('[undefined]'))
  })

  it('handles circular references gracefully', () => {
    const obj = {}
    obj.self = obj
    const result = serializeResult(obj)
    assert.equal(typeof result, 'string')
  })
})
