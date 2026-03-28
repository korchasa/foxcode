import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// Load CJS-compatible modules (plain function declarations + module.exports)
const require = createRequire(import.meta.url)
// dom-helpers must be loaded first (populates globals that browser-api references)
const domHelpers = require('./dom-helpers.js')
// Inject dom-helpers into global scope for browser-api.js
Object.assign(globalThis, domHelpers)
const { createBrowserApi } = require('./browser-api.js')

/** Create mock browser dependencies */
function createMocks(overrides = {}) {
  const tabs = {
    executeScript: async (_tabId, { code }) => {
      if (tabs._executeResult !== undefined) return [tabs._executeResult]
      return [null]
    },
    query: async (filter) => {
      if (filter.active && filter.currentWindow) return [{ id: 1, url: 'https://example.com', title: 'Example' }]
      return [
        { id: 1, index: 0, url: 'https://a.com', title: 'A', active: true },
        { id: 2, index: 1, url: 'https://b.com', title: 'B', active: false },
      ]
    },
    update: async () => {},
    create: async ({ url }) => ({ id: 99, url }),
    remove: async () => {},
    goBack: async () => {},
    goForward: async () => {},
    reload: async () => {},
    captureVisibleTab: async () => 'data:image/png;base64,AAAA',
    sendMessage: async (_tabId, msg) => {
      if (tabs._sendMessageResult) return tabs._sendMessageResult
      return { ok: true, result: null }
    },
    _executeResult: undefined,
    _sendMessageResult: undefined,
    ...overrides.tabs,
  }

  const cookies = {
    getAll: async (filter) => [{ name: 'sid', value: '123' }],
    set: async (details) => details,
    remove: async ({ name, url }) => ({ name, url }),
    ...overrides.cookies,
  }

  const windows = {
    update: async () => {},
    getCurrent: async () => ({ id: 1 }),
    ...overrides.windows,
  }

  // Add onRemoved mock for managed tab cleanup
  if (!tabs.onRemoved) {
    tabs.onRemoved = {
      _listeners: [],
      addListener(fn) { this._listeners.push(fn) },
      removeListener(fn) { this._listeners = this._listeners.filter(l => l !== fn) },
      _fire(tabId) { for (const fn of [...this._listeners]) fn(tabId) },
    }
  }

  const webNavigation = {
    onCompleted: {
      _listeners: [],
      addListener(fn) { this._listeners.push(fn) },
      removeListener(fn) { this._listeners = this._listeners.filter(l => l !== fn) },
      _fire(details) { for (const fn of [...this._listeners]) fn(details) },
    },
    ...overrides.webNavigation,
  }

  return { tabs, cookies, windows, webNavigation }
}

describe('createBrowserApi', () => {
  let mocks, api

  beforeEach(() => {
    mocks = createMocks()
    api = createBrowserApi(mocks)
  })

  describe('execInTab', () => {
    it('returns executeScript result', async () => {
      mocks.tabs._executeResult = { ok: true, tag: 'DIV' }
      const result = await api._execInTab(1, 'return 1')
      assert.deepEqual(result, { ok: true, tag: 'DIV' })
    })

    it('returns null when executeScript returns empty', async () => {
      mocks.tabs.executeScript = async () => []
      const result = await api._execInTab(1, 'x')
      assert.equal(result, null)
    })
  })

  describe('click', () => {
    it('calls executeScript with click code', async () => {
      let executedCode = ''
      mocks.tabs.executeScript = async (_id, { code }) => {
        executedCode = code
        return [{ ok: true, tag: 'BUTTON', id: 'btn' }]
      }
      const result = await api.click('#btn')
      assert.equal(result.ok, true)
      assert.ok(executedCode.includes('#btn'))
      assert.ok(executedCode.includes('click'))
    })

    it('throws on timeout result', async () => {
      mocks.tabs.executeScript = async () => [{ ok: false, error: 'Timeout (2000ms) waiting for #missing' }]
      await assert.rejects(() => api.click('#missing'), /Timeout/)
    })
  })

  describe('fill', () => {
    it('executes fill with native setter pattern', async () => {
      let executedCode = ''
      mocks.tabs.executeScript = async (_id, { code }) => {
        executedCode = code
        return [{ ok: true, tag: 'INPUT', id: 'email' }]
      }
      const result = await api.fill('#email', 'test@test.com')
      assert.equal(result.ok, true)
      assert.ok(executedCode.includes('getOwnPropertyDescriptor'))
      assert.ok(executedCode.includes('test@test.com'))
    })
  })

  describe('waitFor', () => {
    it('executes waitFor code', async () => {
      mocks.tabs.executeScript = async (_id, { code }) => {
        return [{ ok: true, tag: 'DIV', id: 'modal', className: '' }]
      }
      const result = await api.waitFor('.modal')
      assert.equal(result.ok, true)
      assert.equal(result.tag, 'DIV')
    })

    it('throws on timeout', async () => {
      mocks.tabs.executeScript = async () => [{ ok: false, error: 'Timeout' }]
      await assert.rejects(() => api.waitFor('.nope'), /Timeout/)
    })
  })

  describe('$', () => {
    it('returns element descriptor', async () => {
      mocks.tabs.executeScript = async () => [{ ok: true, tag: 'A', id: 'link', href: '/x' }]
      const result = await api.$('a#link')
      assert.equal(result.tag, 'A')
    })
  })

  describe('$$', () => {
    it('returns array of descriptors', async () => {
      mocks.tabs.executeScript = async () => [[
        { tag: 'LI', id: '', text: 'item1' },
        { tag: 'LI', id: '', text: 'item2' },
      ]]
      const result = await api.$$('li')
      assert.equal(result.length, 2)
    })

    it('returns empty array when no matches', async () => {
      mocks.tabs.executeScript = async () => [[]]
      const result = await api.$$('.none')
      assert.deepEqual(result, [])
    })
  })

  describe('snapshot', () => {
    it('returns text content', async () => {
      mocks.tabs.executeScript = async () => ['# Page Title\nURL: https://x.com\n\nHello world']
      const result = await api.snapshot()
      assert.ok(result.includes('Hello world'))
    })
  })

  describe('getTitle', () => {
    it('returns document title', async () => {
      mocks.tabs.executeScript = async () => ['My Page']
      const result = await api.getTitle()
      assert.equal(result, 'My Page')
    })
  })

  describe('getUrl', () => {
    it('returns location.href', async () => {
      mocks.tabs.executeScript = async () => ['https://example.com/path']
      const result = await api.getUrl()
      assert.equal(result, 'https://example.com/path')
    })
  })

  describe('getSelectedText', () => {
    it('returns selected text', async () => {
      mocks.tabs.executeScript = async () => ['selected text']
      const result = await api.getSelectedText()
      assert.equal(result, 'selected text')
    })
  })

  describe('navigate', () => {
    it('creates new tab on first call and resolves after onCompleted', async () => {
      let createdOpts = null
      mocks.tabs.create = async (opts) => { createdOpts = opts; return { id: 99 } }

      const p = api.navigate('https://new.com')
      setTimeout(() => {
        mocks.webNavigation.onCompleted._fire({ tabId: 99, frameId: 0 })
      }, 10)
      await p
      assert.equal(createdOpts.url, 'https://new.com')
      assert.equal(createdOpts.active, true)
    })
  })

  describe('goBack', () => {
    it('calls tabs.goBack and resolves after onCompleted', async () => {
      let called = false
      mocks.tabs.goBack = async () => { called = true }
      const p = api.goBack()
      setTimeout(() => mocks.webNavigation.onCompleted._fire({ tabId: 1, frameId: 0 }), 10)
      await p
      assert.ok(called)
    })
  })

  describe('getTabs', () => {
    it('returns simplified tab list', async () => {
      const tabs = await api.getTabs()
      assert.equal(tabs.length, 2)
      assert.equal(tabs[0].url, 'https://a.com')
      assert.equal(tabs[1].active, false)
    })
  })

  describe('newTab', () => {
    it('creates tab with url', async () => {
      const result = await api.newTab('https://new.com')
      assert.equal(result.id, 99)
    })
  })

  describe('screenshot', () => {
    it('returns base64 string', async () => {
      const result = await api.screenshot()
      assert.ok(result.startsWith('data:image'))
    })
  })

  describe('getCookies', () => {
    it('returns cookies', async () => {
      const result = await api.getCookies({})
      assert.equal(result[0].name, 'sid')
    })
  })

  describe('setCookie', () => {
    it('sets cookie', async () => {
      const result = await api.setCookie({ name: 'x', value: 'y', url: 'https://a.com' })
      assert.equal(result.name, 'x')
    })
  })

  describe('deleteCookie', () => {
    it('deletes cookie', async () => {
      const result = await api.deleteCookie('sid', 'https://a.com')
      assert.equal(result.name, 'sid')
    })
  })

  describe('resize', () => {
    it('calls windows.update', async () => {
      let args = {}
      mocks.windows.update = async (id, opts) => { args = opts }
      await api.resize(800, 600)
      assert.equal(args.width, 800)
      assert.equal(args.height, 600)
    })
  })

  describe('eval', () => {
    it('sends EVAL_IN_PAGE message to tab', async () => {
      mocks.tabs.sendMessage = async (_id, msg) => {
        assert.equal(msg.action, 'EVAL_IN_PAGE')
        assert.equal(msg.expression, 'document.title')
        return { ok: true, result: 'Test Page' }
      }
      const result = await api.eval('document.title')
      assert.equal(result, 'Test Page')
    })

    it('throws on eval error', async () => {
      mocks.tabs.sendMessage = async () => ({ ok: false, error: 'ReferenceError: x is not defined' })
      await assert.rejects(() => api.eval('x.y'), /ReferenceError/)
    })
  })

  describe('press', () => {
    it('dispatches key events', async () => {
      let code = ''
      mocks.tabs.executeScript = async (_id, opts) => { code = opts.code; return [null] }
      await api.press('Enter')
      assert.ok(code.includes('Enter'))
      assert.ok(code.includes('keydown'))
      assert.ok(code.includes('keyup'))
    })
  })

  describe('scrollTo', () => {
    it('calls window.scrollTo', async () => {
      let code = ''
      mocks.tabs.executeScript = async (_id, opts) => { code = opts.code; return [null] }
      await api.scrollTo(0, 500)
      assert.ok(code.includes('scrollTo'))
      assert.ok(code.includes('500'))
    })
  })

  describe('localStorage', () => {
    it('list returns entries', async () => {
      mocks.tabs.executeScript = async () => [[['key1', 'val1']]]
      const result = await api.localStorage.list()
      assert.deepEqual(result, [['key1', 'val1']])
    })

    it('get returns value', async () => {
      mocks.tabs.executeScript = async () => ['myval']
      const result = await api.localStorage.get('key1')
      assert.equal(result, 'myval')
    })
  })

  describe('interceptDialog', () => {
    it('injects dialog interceptor code', async () => {
      let code = ''
      mocks.tabs.executeScript = async (_id, opts) => { code = opts.code; return [null] }
      await api.interceptDialog('accept')
      assert.ok(code.includes('confirm'))
      assert.ok(code.includes('true'))
    })
  })

  describe('captureConsole/getConsoleLogs', () => {
    it('captureConsole injects monkey-patch', async () => {
      let code = ''
      mocks.tabs.executeScript = async (_id, opts) => { code = opts.code; return [null] }
      await api.captureConsole()
      assert.ok(code.includes('console'))
      assert.ok(code.includes('__capturedLogs'))
    })

    it('getConsoleLogs retrieves entries', async () => {
      mocks.tabs.executeScript = async () => [[{ level: 'log', args: ['hello'] }]]
      const result = await api.getConsoleLogs()
      assert.equal(result[0].level, 'log')
    })
  })

  describe('managed tab', () => {
    it('navigate creates new tab on first call instead of updating active', async () => {
      let createdUrl = null
      let updatedUrl = null
      mocks.tabs.create = async ({ url, active }) => {
        createdUrl = url
        assert.equal(active, true, 'managed tab should be created as active')
        return { id: 50 }
      }
      mocks.tabs.update = async (_id, opts) => { updatedUrl = opts?.url }

      const p = api.navigate('https://new.com')
      setTimeout(() => mocks.webNavigation.onCompleted._fire({ tabId: 50, frameId: 0 }), 10)
      await p

      assert.equal(createdUrl, 'https://new.com')
      assert.equal(updatedUrl, null, 'should not update existing tab')
    })

    it('second navigate reuses managed tab and activates it', async () => {
      let createCount = 0
      const updateCalls = []
      mocks.tabs.create = async ({ url }) => { createCount++; return { id: 50 } }
      mocks.tabs.update = async (id, opts) => { updateCalls.push({ id, ...opts }) }

      // First navigate — creates tab
      const p1 = api.navigate('https://first.com')
      setTimeout(() => mocks.webNavigation.onCompleted._fire({ tabId: 50, frameId: 0 }), 10)
      await p1

      // Second navigate — reuses managed tab and activates it
      const p2 = api.navigate('https://second.com')
      setTimeout(() => mocks.webNavigation.onCompleted._fire({ tabId: 50, frameId: 0 }), 10)
      await p2

      assert.equal(createCount, 1, 'should create tab only once')
      assert.ok(updateCalls.some(c => c.id === 50 && c.url === 'https://second.com' && c.active === true),
        'should update URL and activate managed tab in one call')
    })

    it('click targets managed tab after navigate', async () => {
      mocks.tabs.create = async ({ url }) => ({ id: 50 })
      let executedOnTabId = null
      mocks.tabs.executeScript = async (tabId, { code }) => {
        executedOnTabId = tabId
        return [{ ok: true, tag: 'BUTTON', id: 'btn' }]
      }

      const p = api.navigate('https://example.com')
      setTimeout(() => mocks.webNavigation.onCompleted._fire({ tabId: 50, frameId: 0 }), 10)
      await p

      await api.click('#btn')
      assert.equal(executedOnTabId, 50, 'should target managed tab, not active tab')
    })

    it('eval targets managed tab after navigate', async () => {
      mocks.tabs.create = async ({ url }) => ({ id: 50 })
      let sentToTabId = null
      mocks.tabs.sendMessage = async (tabId, msg) => {
        sentToTabId = tabId
        return { ok: true, result: 'test' }
      }

      const p = api.navigate('https://example.com')
      setTimeout(() => mocks.webNavigation.onCompleted._fire({ tabId: 50, frameId: 0 }), 10)
      await p

      await api.eval('document.title')
      assert.equal(sentToTabId, 50, 'should target managed tab')
    })

    it('goBack targets managed tab', async () => {
      mocks.tabs.create = async ({ url }) => ({ id: 50 })
      let goBackTabId = null
      mocks.tabs.goBack = async (tabId) => { goBackTabId = tabId }

      const p = api.navigate('https://example.com')
      setTimeout(() => mocks.webNavigation.onCompleted._fire({ tabId: 50, frameId: 0 }), 10)
      await p

      const p2 = api.goBack()
      setTimeout(() => mocks.webNavigation.onCompleted._fire({ tabId: 50, frameId: 0 }), 10)
      await p2
      assert.equal(goBackTabId, 50)
    })

    it('closeTab() without args closes managed tab', async () => {
      mocks.tabs.create = async ({ url }) => ({ id: 50 })
      let removedId = null
      mocks.tabs.remove = async (id) => { removedId = id }

      const p = api.navigate('https://example.com')
      setTimeout(() => mocks.webNavigation.onCompleted._fire({ tabId: 50, frameId: 0 }), 10)
      await p

      await api.closeTab()
      assert.equal(removedId, 50, 'should close managed tab')
    })

    it('navigate after closeTab creates fresh tab', async () => {
      let createCount = 0
      mocks.tabs.create = async ({ url }) => { createCount++; return { id: 50 + createCount } }

      // First navigate
      const p1 = api.navigate('https://first.com')
      setTimeout(() => mocks.webNavigation.onCompleted._fire({ tabId: 51, frameId: 0 }), 10)
      await p1

      // Close managed tab
      await api.closeTab()

      // Second navigate — should create new tab
      const p2 = api.navigate('https://second.com')
      setTimeout(() => mocks.webNavigation.onCompleted._fire({ tabId: 52, frameId: 0 }), 10)
      await p2

      assert.equal(createCount, 2, 'should create new tab after close')
    })

    it('onRemoved resets managed tab, next call falls back to active', async () => {
      mocks.tabs.create = async ({ url }) => ({ id: 50 })
      let executedOnTabId = null
      mocks.tabs.executeScript = async (tabId, { code }) => {
        executedOnTabId = tabId
        return [{ ok: true, tag: 'DIV' }]
      }

      const p = api.navigate('https://example.com')
      setTimeout(() => mocks.webNavigation.onCompleted._fire({ tabId: 50, frameId: 0 }), 10)
      await p

      // Simulate user closing managed tab
      mocks.tabs.onRemoved._fire(50)

      // Next operation should fall back to active tab (id: 1)
      await api.click('#btn')
      assert.equal(executedOnTabId, 1, 'should fall back to active tab after managed tab removed')
    })

    it('closeTab(index) resets managed tab when index matches', async () => {
      mocks.tabs.create = async ({ url }) => ({ id: 50 })
      // Make managed tab appear at index 2
      mocks.tabs.query = async (filter) => {
        if (filter.active && filter.currentWindow) return [{ id: 1 }]
        return [
          { id: 1, index: 0, url: 'https://a.com', active: true },
          { id: 50, index: 1, url: 'https://example.com', active: false },
        ]
      }
      let removedId = null
      mocks.tabs.remove = async (id) => { removedId = id }

      const p = api.navigate('https://example.com')
      setTimeout(() => mocks.webNavigation.onCompleted._fire({ tabId: 50, frameId: 0 }), 10)
      await p

      await api.closeTab(1)
      assert.equal(removedId, 50)

      // Verify managed tab is reset — next click targets active tab
      let executedOnTabId = null
      mocks.tabs.executeScript = async (tabId) => { executedOnTabId = tabId; return [{ ok: true }] }
      await api.click('#btn')
      assert.equal(executedOnTabId, 1, 'should fall back to active tab')
    })

    it('screenshot activates managed tab, captures, restores focus', async () => {
      mocks.tabs.create = async ({ url }) => ({ id: 50 })
      const updateCalls = []
      mocks.tabs.update = async (id, opts) => { updateCalls.push({ id, ...opts }) }

      const p = api.navigate('https://example.com')
      setTimeout(() => mocks.webNavigation.onCompleted._fire({ tabId: 50, frameId: 0 }), 10)
      await p

      const result = await api.screenshot()
      assert.ok(result.startsWith('data:image'))
      // Should activate managed tab, then restore active tab
      assert.ok(updateCalls.some(c => c.id === 50 && c.active === true), 'should activate managed tab')
      assert.ok(updateCalls.some(c => c.id === 1 && c.active === true), 'should restore original active tab')
    })
  })
})
