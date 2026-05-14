const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { parseFoxcodeParams, getParamsFromTabs } = require('./url-params.js')

describe('parseFoxcodeParams', () => {
  it('parses port and password from about:blank hash', () => {
    const result = parseFoxcodeParams('about:blank#8795:abc123')
    assert.equal(result.port, 8795)
    assert.equal(result.password, 'abc123')
  })

  it('parses port only (no password)', () => {
    const result = parseFoxcodeParams('about:blank#8801')
    assert.equal(result.port, 8801)
    assert.equal(result.password, null)
  })

  it('parses port from http URL hash', () => {
    const result = parseFoxcodeParams('http://example.com/page#8801:secret')
    assert.equal(result.port, 8801)
    assert.equal(result.password, 'secret')
  })

  it('returns nulls when no hash', () => {
    const result = parseFoxcodeParams('about:blank')
    assert.equal(result.port, null)
    assert.equal(result.password, null)
  })

  it('returns nulls when hash is not a foxcode port', () => {
    const result = parseFoxcodeParams('about:blank#other')
    assert.equal(result.port, null)
    assert.equal(result.password, null)
  })

  it('returns null port for non-numeric port', () => {
    const result = parseFoxcodeParams('about:blank#abc')
    assert.equal(result.port, null)
  })

  it('returns null port for port below range (8787)', () => {
    const result = parseFoxcodeParams('about:blank#8786')
    assert.equal(result.port, null)
  })

  it('returns null port for port above range (8886)', () => {
    const result = parseFoxcodeParams('about:blank#8887')
    assert.equal(result.port, null)
  })

  it('accepts min port in range', () => {
    const result = parseFoxcodeParams('about:blank#8787:pass')
    assert.equal(result.port, 8787)
    assert.equal(result.password, 'pass')
  })

  it('accepts max port in range', () => {
    const result = parseFoxcodeParams('about:blank#8886:pass')
    assert.equal(result.port, 8886)
    assert.equal(result.password, 'pass')
  })

  it('returns nulls for null/undefined input', () => {
    assert.deepEqual(parseFoxcodeParams(null), { port: null, password: null })
    assert.deepEqual(parseFoxcodeParams(undefined), { port: null, password: null })
  })

  it('returns nulls for empty string', () => {
    assert.deepEqual(parseFoxcodeParams(''), { port: null, password: null })
  })

  it('parses password with hex characters', () => {
    const result = parseFoxcodeParams('about:blank#8800:a1b2c3d4e5f6')
    assert.equal(result.port, 8800)
    assert.equal(result.password, 'a1b2c3d4e5f6')
  })

  it('handles password containing colons', () => {
    const result = parseFoxcodeParams('about:blank#8800:pass:with:colons')
    assert.equal(result.port, 8800)
    assert.equal(result.password, 'pass:with:colons')
  })

  it('returns nulls for empty hash', () => {
    const result = parseFoxcodeParams('about:blank#')
    assert.equal(result.port, null)
    assert.equal(result.password, null)
  })
})

describe('getParamsFromTabs', () => {
  it('finds all params from matching tabs', async () => {
    const tabs = [
      { url: 'https://example.com' },
      { url: 'about:blank#8790:secret' },
      { url: 'about:blank#8801:other' },
    ]
    const result = await getParamsFromTabs(async () => tabs)
    assert.deepEqual(result, [
      { port: 8790, password: 'secret' },
      { port: 8801, password: 'other' },
    ])
  })

  it('returns empty array when no tabs have foxcode params', async () => {
    const tabs = [
      { url: 'https://example.com' },
      { url: 'about:blank' },
    ]
    const result = await getParamsFromTabs(async () => tabs)
    assert.deepEqual(result, [])
  })

  it('returns empty array when tabs list is empty', async () => {
    const result = await getParamsFromTabs(async () => [])
    assert.deepEqual(result, [])
  })

  it('returns empty array when queryTabs throws', async () => {
    const result = await getParamsFromTabs(async () => { throw new Error('no permission') })
    assert.deepEqual(result, [])
  })

  it('deduplicates by port', async () => {
    const tabs = [
      { url: 'about:blank#8790:first' },
      { url: 'about:blank#8790:second' },
    ]
    const result = await getParamsFromTabs(async () => tabs)
    assert.deepEqual(result, [{ port: 8790, password: 'first' }])
  })

  it('returns params with null password when tab has port only', async () => {
    const tabs = [
      { url: 'about:blank#8790' },
    ]
    const result = await getParamsFromTabs(async () => tabs)
    assert.deepEqual(result, [{ port: 8790, password: null }])
  })
})
