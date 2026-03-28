/**
 * FoxCode — Background script.
 * Manages WebSocket connection to channel server and routes messages
 * between sidebar, content script, and channel.
 *
 * EVAL_CODE handler: executes agent JS code with injected browser API object.
 */

/* global browser, WebSocket */

// browser-api.js and dom-helpers.js are ES modules — background script (Manifest V2)
// cannot use import. We load them via importScripts() isn't available either.
// Instead, the factory and helpers are inlined below via build step or loaded as
// additional background scripts in manifest.json.
// For now, we reference createBrowserApi from the global scope (loaded via manifest).

const WS_URL = 'ws://127.0.0.1:8787'
const RECONNECT_INTERVAL_MS = 3000
const MAX_RECONNECT_INTERVAL_MS = 30000

let ws = null
let reconnectTimer = null
let reconnectInterval = RECONNECT_INTERVAL_MS
let sidebarPort = null

// --- Browser API instance (lazy init) ---
let browserApi = null

function getBrowserApi() {
  if (!browserApi) {
    browserApi = createBrowserApi({
      tabs: browser.tabs,
      cookies: browser.cookies,
      windows: browser.windows,
      webNavigation: browser.webNavigation,
    })
  }
  return browserApi
}

// serializeResult is loaded from serialize.js via manifest.json

// --- WebSocket connection ---

function connect() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return

  try {
    ws = new WebSocket(WS_URL)
  } catch {
    scheduleReconnect()
    return
  }

  ws.onopen = () => {
    reconnectInterval = RECONNECT_INTERVAL_MS
    broadcastStatus(true)
  }

  ws.onclose = () => {
    broadcastStatus(false)
    scheduleReconnect()
  }

  ws.onerror = () => {
    // onclose will fire after this
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      handleChannelMessage(msg)
    } catch { /* ignore malformed messages */ }
  }
}

/**
 * Schedule a WebSocket reconnection with exponential backoff.
 * Interval grows by 1.5x each attempt (3s → 4.5s → 6.75s → ...),
 * capped at MAX_RECONNECT_INTERVAL_MS (30s). Resets to base on successful connect.
 */
function scheduleReconnect() {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    reconnectInterval = Math.min(reconnectInterval * 1.5, MAX_RECONNECT_INTERVAL_MS)
    connect()
  }, reconnectInterval)
}

/**
 * Send a JSON message to the channel server via WebSocket.
 * @param {Object} msg - Message object to serialize and send
 * @returns {boolean} true if sent, false if connection unavailable
 */
function sendToChannel(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
    return true
  }
  return false
}

function broadcastStatus(connected) {
  if (sidebarPort) {
    sidebarPort.postMessage({ type: 'status', connected })
  }
}

// --- Handle messages from channel server ---

function handleChannelMessage(msg) {
  switch (msg.type) {
    case 'msg':
    case 'edit':
    case 'tool_use':
    case 'tool_result':
      if (sidebarPort) sidebarPort.postMessage(msg)
      break

    case 'tool_request':
      handleToolRequest(msg)
      break
  }
}

async function handleToolRequest(msg) {
  const { request_id, tool, params } = msg
  try {
    let content
    switch (tool) {
      case 'EVAL_CODE': {
        const api = getBrowserApi()
        const timeout = params.timeout ?? 30000
        const fn = new Function('api', `return (async () => { ${params.code} })()`)
        const resultPromise = fn(api)
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout: code execution exceeded ${timeout}ms`)), timeout)
        )
        const result = await Promise.race([resultPromise, timeoutPromise])
        content = serializeResult(result)
        break
      }
      default:
        content = `unknown tool: ${tool}`
    }
    sendToChannel({ type: 'tool_response', request_id, content })
  } catch (err) {
    const errorResult = { ok: false, error: err.message, stack: err.stack }
    sendToChannel({ type: 'tool_response', request_id, content: JSON.stringify(errorResult) })
  }
}

// --- Handle messages from sidebar ---

browser.runtime.onConnect.addListener((port) => {
  if (port.name !== 'sidebar') return
  sidebarPort = port

  // Send current connection status
  const connected = ws && ws.readyState === WebSocket.OPEN
  port.postMessage({ type: 'status', connected })

  port.onMessage.addListener((msg) => {
    switch (msg.type) {
      case 'message':
        sendToChannel(msg)
        break
      case 'connect':
        connect()
        break
    }
  })

  port.onDisconnect.addListener(() => {
    sidebarPort = null
  })
})

// Start connection
connect()
