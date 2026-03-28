/**
 * Browser API factory — creates the `api` object injected into evalInBrowser code.
 * Receives browser dependencies via DI for testability.
 *
 * In browser: dom-helpers.js loaded before this file, functions are global.
 * In Node.js tests: imported via test wrapper.
 *
 * @param {object} deps - { tabs, cookies, windows, webNavigation }
 * @returns {object} API object with all browser automation helpers
 */

/* eslint-disable no-unused-vars */
/* global buildWaitAndAct buildWaitFor buildClickAction buildDblclickAction
   buildFillAction buildTypeAction buildSelectAction buildCheckAction
   buildHoverAction buildQueryAction buildQueryAllCode buildSnapshotAction */

function createBrowserApi(deps) {
  const { tabs, cookies, windows, webNavigation } = deps

  /** ID of the agent-managed tab, or null if none */
  let managedTabId = null

  // Clean up managed tab reference when tab is closed (by user or programmatically)
  if (tabs.onRemoved) {
    tabs.onRemoved.addListener((tabId) => {
      if (tabId === managedTabId) managedTabId = null
    })
  }

  async function getActiveTabId() {
    const t = await tabs.query({ active: true, currentWindow: true })
    if (!t[0]?.id) throw new Error('No active tab')
    return t[0].id
  }

  /** Returns managed tab if set, otherwise active tab */
  async function getTargetTabId() {
    if (managedTabId !== null) return managedTabId
    return getActiveTabId()
  }

  async function execInTab(tabId, code) {
    const results = await tabs.executeScript(tabId, { code })
    return results?.[0] ?? null
  }

  /** Wait for navigation to complete on given tab */
  function waitForNavigation(tabId) {
    return new Promise((resolve) => {
      const listener = (details) => {
        if (details.tabId === tabId && details.frameId === 0) {
          webNavigation.onCompleted.removeListener(listener)
          resolve()
        }
      }
      webNavigation.onCompleted.addListener(listener)
    })
  }

  function buildStorageHelpers(storageName) {
    return {
      async list() {
        const tabId = await getTargetTabId()
        return execInTab(tabId, `
          (() => {
            const s = ${storageName};
            const entries = [];
            for (let i=0; i<s.length; i++) { const k=s.key(i); entries.push([k,s.getItem(k)]); }
            return entries;
          })()
        `)
      },
      async get(key) {
        const tabId = await getTargetTabId()
        return execInTab(tabId, `${storageName}.getItem(${JSON.stringify(key)})`)
      },
      async set(key, value) {
        const tabId = await getTargetTabId()
        return execInTab(tabId, `${storageName}.setItem(${JSON.stringify(key)},${JSON.stringify(value)})`)
      },
      async delete(key) {
        const tabId = await getTargetTabId()
        return execInTab(tabId, `${storageName}.removeItem(${JSON.stringify(key)})`)
      },
      async clear() {
        const tabId = await getTargetTabId()
        return execInTab(tabId, `${storageName}.clear()`)
      },
    }
  }

  const api = {
    // Exposed for testing
    _execInTab: execInTab,

    // --- Wait ---

    async waitFor(selector, { timeout = 2000, visible = false } = {}) {
      const tabId = await getTargetTabId()
      const code = buildWaitFor(selector, timeout, visible)
      const result = await execInTab(tabId, code)
      if (!result?.ok) throw new Error(result?.error || 'waitFor failed')
      return result
    },

    // --- DOM Interaction ---

    async click(selector, { timeout = 2000 } = {}) {
      const tabId = await getTargetTabId()
      const code = buildWaitAndAct(selector, timeout, buildClickAction())
      const result = await execInTab(tabId, code)
      if (!result?.ok) throw new Error(result?.error || 'click failed')
      return result
    },

    async dblclick(selector, { timeout = 2000 } = {}) {
      const tabId = await getTargetTabId()
      const code = buildWaitAndAct(selector, timeout, buildDblclickAction())
      const result = await execInTab(tabId, code)
      if (!result?.ok) throw new Error(result?.error || 'dblclick failed')
      return result
    },

    async type(selector, text, { timeout = 2000 } = {}) {
      const tabId = await getTargetTabId()
      const code = buildWaitAndAct(selector, timeout, buildTypeAction(text))
      const result = await execInTab(tabId, code)
      if (!result?.ok) throw new Error(result?.error || 'type failed')
      return result
    },

    async fill(selector, value, { timeout = 2000 } = {}) {
      const tabId = await getTargetTabId()
      const code = buildWaitAndAct(selector, timeout, buildFillAction(value))
      const result = await execInTab(tabId, code)
      if (!result?.ok) throw new Error(result?.error || 'fill failed')
      return result
    },

    async select(selector, value, { timeout = 2000 } = {}) {
      const tabId = await getTargetTabId()
      const code = buildWaitAndAct(selector, timeout, buildSelectAction(value))
      const result = await execInTab(tabId, code)
      if (!result?.ok) throw new Error(result?.error || 'select failed')
      return result
    },

    async check(selector, { timeout = 2000 } = {}) {
      const tabId = await getTargetTabId()
      const code = buildWaitAndAct(selector, timeout, buildCheckAction(true))
      const result = await execInTab(tabId, code)
      if (!result?.ok) throw new Error(result?.error || 'check failed')
      return result
    },

    async uncheck(selector, { timeout = 2000 } = {}) {
      const tabId = await getTargetTabId()
      const code = buildWaitAndAct(selector, timeout, buildCheckAction(false))
      const result = await execInTab(tabId, code)
      if (!result?.ok) throw new Error(result?.error || 'uncheck failed')
      return result
    },

    async hover(selector, { timeout = 2000 } = {}) {
      const tabId = await getTargetTabId()
      const code = buildWaitAndAct(selector, timeout, buildHoverAction())
      const result = await execInTab(tabId, code)
      if (!result?.ok) throw new Error(result?.error || 'hover failed')
      return result
    },

    async press(key) {
      const tabId = await getTargetTabId()
      const escaped = JSON.stringify(key)
      const code = `
        document.dispatchEvent(new KeyboardEvent('keydown',{key:${escaped},bubbles:true}));
        document.dispatchEvent(new KeyboardEvent('keyup',{key:${escaped},bubbles:true}));
      `
      return execInTab(tabId, code)
    },

    async scrollTo(x, y) {
      const tabId = await getTargetTabId()
      return execInTab(tabId, `window.scrollTo(${x},${y})`)
    },

    async scrollBy(dx, dy) {
      const tabId = await getTargetTabId()
      return execInTab(tabId, `window.scrollBy(${dx},${dy})`)
    },

    // --- Page Query ---

    async $(selector, { timeout = 2000 } = {}) {
      const tabId = await getTargetTabId()
      const code = buildWaitAndAct(selector, timeout, buildQueryAction())
      const result = await execInTab(tabId, code)
      if (!result?.ok) throw new Error(result?.error || '$ failed')
      return result
    },

    async $$(selector) {
      const tabId = await getTargetTabId()
      const code = buildQueryAllCode(selector)
      return (await execInTab(tabId, code)) || []
    },

    async snapshot(selector, { timeout = 2000 } = {}) {
      const tabId = await getTargetTabId()
      if (selector) {
        // Wait for element first, then snapshot subtree
        const waitCode = buildWaitFor(selector, timeout, false)
        const waitResult = await execInTab(tabId, waitCode)
        if (!waitResult?.ok) throw new Error(waitResult?.error || 'snapshot: element not found')
      }
      const code = buildSnapshotAction(selector || null)
      return execInTab(tabId, code)
    },

    async getTitle() {
      const tabId = await getTargetTabId()
      return execInTab(tabId, 'document.title')
    },

    async getUrl() {
      const tabId = await getTargetTabId()
      return execInTab(tabId, 'location.href')
    },

    async getSelectedText() {
      const tabId = await getTargetTabId()
      return execInTab(tabId, 'window.getSelection().toString()')
    },

    // --- Eval (page main world) ---

    async eval(expression) {
      const tabId = await getTargetTabId()
      const result = await tabs.sendMessage(tabId, {
        action: 'EVAL_IN_PAGE',
        expression,
      })
      if (!result?.ok) throw new Error(result?.error || 'eval failed')
      return result.result
    },

    // --- Navigation ---

    async navigate(url) {
      if (managedTabId === null) {
        const tab = await tabs.create({ url, active: true })
        managedTabId = tab.id
        await waitForNavigation(managedTabId)
      } else {
        const loaded = waitForNavigation(managedTabId)
        await tabs.update(managedTabId, { url, active: true })
        await loaded
      }
    },

    async goBack() {
      const tabId = await getTargetTabId()
      const loaded = waitForNavigation(tabId)
      await tabs.goBack(tabId)
      await loaded
    },

    async goForward() {
      const tabId = await getTargetTabId()
      const loaded = waitForNavigation(tabId)
      await tabs.goForward(tabId)
      await loaded
    },

    async reload() {
      const tabId = await getTargetTabId()
      const loaded = waitForNavigation(tabId)
      await tabs.reload(tabId)
      await loaded
    },

    async waitForLoad() {
      const tabId = await getTargetTabId()
      await waitForNavigation(tabId)
    },

    // --- Tabs ---

    async getTabs() {
      const all = await tabs.query({})
      return all.map(t => ({ index: t.index, url: t.url, title: t.title, active: t.active }))
    },

    async newTab(url) {
      return tabs.create({ url })
    },

    async closeTab(index) {
      if (index === undefined && managedTabId !== null) {
        const id = managedTabId
        managedTabId = null
        return tabs.remove(id)
      }
      const all = await tabs.query({})
      const tab = all.find(t => t.index === index)
      if (!tab) throw new Error(`No tab at index ${index}`)
      if (tab.id === managedTabId) managedTabId = null
      return tabs.remove(tab.id)
    },

    async selectTab(index) {
      const all = await tabs.query({})
      const tab = all.find(t => t.index === index)
      if (!tab) throw new Error(`No tab at index ${index}`)
      return tabs.update(tab.id, { active: true })
    },

    // --- Cookies ---

    async getCookies(filter = {}) {
      return cookies.getAll(filter)
    },

    async setCookie(details) {
      return cookies.set(details)
    },

    async deleteCookie(name, url) {
      return cookies.remove({ name, url })
    },

    // --- Window ---

    async resize(width, height) {
      const win = await windows.getCurrent()
      return windows.update(win.id, { width, height })
    },

    async screenshot() {
      if (managedTabId !== null) {
        const activeTabId = await getActiveTabId()
        try {
          await tabs.update(managedTabId, { active: true })
          return await tabs.captureVisibleTab(null, { format: 'png' })
        } finally {
          await tabs.update(activeTabId, { active: true })
        }
      }
      return tabs.captureVisibleTab(null, { format: 'png' })
    },

    // --- Dialog ---

    async interceptDialog(action) {
      const tabId = await getTargetTabId()
      const accept = action === 'accept'
      const code = `
        window.__origConfirm = window.confirm;
        window.__origAlert = window.alert;
        window.__origPrompt = window.prompt;
        window.confirm = () => { window.confirm = window.__origConfirm; return ${accept}; };
        window.alert = () => { window.alert = window.__origAlert; };
        window.prompt = () => { window.prompt = window.__origPrompt; return ${accept ? "''" : 'null'}; };
      `
      return execInTab(tabId, code)
    },

    // --- Console ---

    async captureConsole() {
      const tabId = await getTargetTabId()
      const code = `
        if (!window.__capturedLogs) {
          window.__capturedLogs = [];
          ['log','warn','error','info','debug'].forEach(level => {
            const orig = console[level];
            console[level] = (...args) => {
              window.__capturedLogs.push({level, args: args.map(a => {
                try { return JSON.parse(JSON.stringify(a)); } catch { return String(a); }
              }), ts: Date.now()});
              orig.apply(console, args);
            };
          });
        }
      `
      return execInTab(tabId, code)
    },

    async getConsoleLogs() {
      const tabId = await getTargetTabId()
      return execInTab(tabId, 'window.__capturedLogs || []')
    },

    // --- Storage ---

    localStorage: buildStorageHelpers('localStorage'),
    sessionStorage: buildStorageHelpers('sessionStorage'),
  }

  return api
}

// Node.js CJS export support (no-op in browser)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createBrowserApi }
}
