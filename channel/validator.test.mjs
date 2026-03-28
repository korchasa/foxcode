import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateCode } from './validator.mjs'

describe('validateCode', () => {
  it('accepts simple expression', () => {
    const r = validateCode('return 1+1')
    assert.equal(r.valid, true)
  })

  it('accepts top-level await', () => {
    const r = validateCode('await api.click("a"); return 1')
    assert.equal(r.valid, true)
  })

  it('accepts api destructuring', () => {
    const r = validateCode('const {navigate, click} = api; await navigate("http://x")')
    assert.equal(r.valid, true)
  })

  it('rejects syntax errors', () => {
    const r = validateCode('function{{')
    assert.equal(r.valid, false)
    assert.ok(r.error)
  })

  it('rejects unclosed string', () => {
    const r = validateCode("return 'unclosed")
    assert.equal(r.valid, false)
  })

  it('accepts empty code', () => {
    const r = validateCode('')
    assert.equal(r.valid, true)
  })
})
