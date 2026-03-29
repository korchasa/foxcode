const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { parseFoxcodePort, getPortFromTabs } = require('./url-port.js')

describe('parseFoxcodePort', () => {
  it('parses port from about:blank hash', () => {
    assert.equal(parseFoxcodePort('about:blank#foxcode-port=8795'), 8795)
  })

  it('parses port from http URL hash', () => {
    assert.equal(parseFoxcodePort('http://example.com/page#foxcode-port=8801'), 8801)
  })

  it('returns null when no hash', () => {
    assert.equal(parseFoxcodePort('about:blank'), null)
  })

  it('returns null when hash has no foxcode-port', () => {
    assert.equal(parseFoxcodePort('about:blank#other=123'), null)
  })

  it('returns null for non-numeric port', () => {
    assert.equal(parseFoxcodePort('about:blank#foxcode-port=abc'), null)
  })

  it('returns null for port 0', () => {
    assert.equal(parseFoxcodePort('about:blank#foxcode-port=0'), null)
  })

  it('returns null for port above 65535', () => {
    assert.equal(parseFoxcodePort('about:blank#foxcode-port=70000'), null)
  })

  it('returns null for null/undefined input', () => {
    assert.equal(parseFoxcodePort(null), null)
    assert.equal(parseFoxcodePort(undefined), null)
  })

  it('returns null for empty string', () => {
    assert.equal(parseFoxcodePort(''), null)
  })
})

describe('getPortFromTabs', () => {
  it('finds port from matching tab', async () => {
    const tabs = [
      { url: 'https://example.com' },
      { url: 'about:blank#foxcode-port=8790' },
    ]
    const result = await getPortFromTabs(async () => tabs)
    assert.equal(result, 8790)
  })

  it('returns null when no tabs have foxcode-port', async () => {
    const tabs = [
      { url: 'https://example.com' },
      { url: 'about:blank' },
    ]
    const result = await getPortFromTabs(async () => tabs)
    assert.equal(result, null)
  })

  it('returns null when tabs list is empty', async () => {
    const result = await getPortFromTabs(async () => [])
    assert.equal(result, null)
  })

  it('returns null when queryTabs throws', async () => {
    const result = await getPortFromTabs(async () => { throw new Error('no permission') })
    assert.equal(result, null)
  })

  it('returns first matching port', async () => {
    const tabs = [
      { url: 'about:blank#foxcode-port=8790' },
      { url: 'about:blank#foxcode-port=8801' },
    ]
    const result = await getPortFromTabs(async () => tabs)
    assert.equal(result, 8790)
  })
})
