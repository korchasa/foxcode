import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  buildWaitAndAct, buildWaitFor, escapeSelector,
} = require('./dom-helpers.js')

describe('escapeSelector', () => {
  it('escapes quotes in selector via JSON.stringify', () => {
    const r = escapeSelector('a[href="x"]')
    assert.equal(r, '"a[href=\\"x\\"]"')
  })

  it('handles simple selector', () => {
    const r = escapeSelector('#btn')
    assert.equal(r, '"#btn"')
  })
})

describe('buildWaitAndAct', () => {
  it('generates code string with polling', () => {
    const code = buildWaitAndAct('#btn', 2000, 'el.click(); return resolve({ok:true})')
    assert.ok(code.includes('document.querySelector'))
    assert.ok(code.includes('"#btn"'))
    assert.ok(code.includes('2000'))
    assert.ok(code.includes('el.click()'))
  })

  it('escapes selector with quotes', () => {
    const code = buildWaitAndAct('a[data-x="y"]', 1000, 'resolve({ok:true})')
    assert.ok(code.includes('"a[data-x=\\"y\\"]"'))
  })

  it('returns a self-invoking function wrapped in Promise', () => {
    const code = buildWaitAndAct('div', 500, 'resolve(1)')
    assert.ok(code.includes('new Promise'))
    assert.ok(code.includes('setTimeout'))
  })
})

describe('buildWaitFor', () => {
  it('generates code for basic waitFor', () => {
    const code = buildWaitFor('.modal', 3000, false)
    assert.ok(code.includes('document.querySelector'))
    assert.ok(code.includes('".modal"'))
    assert.ok(code.includes('3000'))
  })

  it('includes visibility check when visible=true', () => {
    const code = buildWaitFor('.modal', 2000, true)
    assert.ok(code.includes('offsetWidth'))
    assert.ok(code.includes('offsetHeight'))
  })

  it('does NOT include visibility check when visible=false', () => {
    const code = buildWaitFor('.modal', 2000, false)
    assert.ok(!code.includes('offsetWidth'))
  })

  it('returns element descriptor on success', () => {
    const code = buildWaitFor('div', 2000, false)
    assert.ok(code.includes('tagName'))
    assert.ok(code.includes('className'))
  })
})
