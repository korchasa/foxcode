const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { parseFoxcodeParams, getParamsFromTabs } = require('./url-params.js')

describe('parseFoxcodeParams', () => {
  it('parses port and password from about:blank hash', () => {
    const result = parseFoxcodeParams('about:blank#foxcode-port=8795&foxcode-password=abc123')
    assert.equal(result.port, 8795)
    assert.equal(result.password, 'abc123')
  })

  it('parses port only (no password)', () => {
    const result = parseFoxcodeParams('about:blank#foxcode-port=8801')
    assert.equal(result.port, 8801)
    assert.equal(result.password, null)
  })

  it('parses port from http URL hash', () => {
    const result = parseFoxcodeParams('http://example.com/page#foxcode-port=8801&foxcode-password=secret')
    assert.equal(result.port, 8801)
    assert.equal(result.password, 'secret')
  })

  it('returns nulls when no hash', () => {
    const result = parseFoxcodeParams('about:blank')
    assert.equal(result.port, null)
    assert.equal(result.password, null)
  })

  it('returns nulls when hash has no foxcode params', () => {
    const result = parseFoxcodeParams('about:blank#other=123')
    assert.equal(result.port, null)
    assert.equal(result.password, null)
  })

  it('returns null port for non-numeric port', () => {
    const result = parseFoxcodeParams('about:blank#foxcode-port=abc')
    assert.equal(result.port, null)
  })

  it('returns null port for port 0', () => {
    const result = parseFoxcodeParams('about:blank#foxcode-port=0')
    assert.equal(result.port, null)
  })

  it('returns null port for port above 65535', () => {
    const result = parseFoxcodeParams('about:blank#foxcode-port=70000')
    assert.equal(result.port, null)
  })

  it('returns nulls for null/undefined input', () => {
    assert.deepEqual(parseFoxcodeParams(null), { port: null, password: null })
    assert.deepEqual(parseFoxcodeParams(undefined), { port: null, password: null })
  })

  it('returns nulls for empty string', () => {
    assert.deepEqual(parseFoxcodeParams(''), { port: null, password: null })
  })

  it('parses password with special characters', () => {
    const result = parseFoxcodeParams('about:blank#foxcode-port=8800&foxcode-password=a1b2c3d4e5f6')
    assert.equal(result.port, 8800)
    assert.equal(result.password, 'a1b2c3d4e5f6')
  })
})

describe('getParamsFromTabs', () => {
  it('finds params from matching tab', async () => {
    const tabs = [
      { url: 'https://example.com' },
      { url: 'about:blank#foxcode-port=8790&foxcode-password=secret' },
    ]
    const result = await getParamsFromTabs(async () => tabs)
    assert.deepEqual(result, { port: 8790, password: 'secret' })
  })

  it('returns null when no tabs have foxcode-port', async () => {
    const tabs = [
      { url: 'https://example.com' },
      { url: 'about:blank' },
    ]
    const result = await getParamsFromTabs(async () => tabs)
    assert.equal(result, null)
  })

  it('returns null when tabs list is empty', async () => {
    const result = await getParamsFromTabs(async () => [])
    assert.equal(result, null)
  })

  it('returns null when queryTabs throws', async () => {
    const result = await getParamsFromTabs(async () => { throw new Error('no permission') })
    assert.equal(result, null)
  })

  it('returns first matching tab params', async () => {
    const tabs = [
      { url: 'about:blank#foxcode-port=8790&foxcode-password=first' },
      { url: 'about:blank#foxcode-port=8801&foxcode-password=second' },
    ]
    const result = await getParamsFromTabs(async () => tabs)
    assert.deepEqual(result, { port: 8790, password: 'first' })
  })

  it('returns params with null password when tab has port only', async () => {
    const tabs = [
      { url: 'about:blank#foxcode-port=8790' },
    ]
    const result = await getParamsFromTabs(async () => tabs)
    assert.deepEqual(result, { port: 8790, password: null })
  })
})
