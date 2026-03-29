/**
 * FoxCode - Background script.
 * Manages WebSocket connection to channel server and routes messages
 * between sidebar, content script, and channel.
 *
 * EVAL_CODE handler: executes agent JS code with injected browser API object.
 */

/* global browser, WebSocket */

// browser-api.js and dom-helpers.js are ES modules - background script (Manifest V2)
// cannot use import. We load them via importScripts() isn't available either.
// Instead, the factory and helpers are inlined below via build step or loaded as
// additional background scripts in manifest.json.
// For now, we reference createBrowserApi from the global scope (loaded via manifest).

const RECONNECT_INTERVAL_MS = 3000
const MAX_RECONNECT_INTERVAL_MS = 30000

const STORAGE_KEY_PORT = 'foxcode_last_port'
const STORAGE_KEY_PASSWORD = 'foxcode_last_password'

let ws = null
let reconnectTimer = null
let reconnectInterval = RECONNECT_INTERVAL_MS
let sidebarPort = null
let activePort = null
let activePassword = null
let paramsSource = null // 'url' | 'saved' | 'manual' | null
let lastError = null

/** Save connection params to extension storage for persistence across restarts. */
function saveConnectionParams(port, password) {
  browser.storage.local.set({ [STORAGE_KEY_PORT]: port, [STORAGE_KEY_PASSWORD]: password })
}

/** Load saved connection params from extension storage. Returns {port, password} or null. */
async function loadSavedParams() {
  try {
    const result = await browser.storage.local.get([STORAGE_KEY_PORT, STORAGE_KEY_PASSWORD])
    const port = result[STORAGE_KEY_PORT] ?? null
    const password = result[STORAGE_KEY_PASSWORD] ?? null
    if (port) return { port, password }
    return null
  } catch {
    return null
  }
}

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

/**
 * Connect to a specific server with port and password (token auth).
 */
function connectToServer(port, password) {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    if (activePort === port) return
    ws.close()
  }

  try {
    const url = password
      ? `ws://127.0.0.1:${port}?token=${encodeURIComponent(password)}`
      : `ws://127.0.0.1:${port}`
    ws = new WebSocket(url)
  } catch {
    scheduleReconnect()
    return
  }
  activePort = port
  activePassword = password
  saveConnectionParams(port, password)

  ws.onopen = () => {
    reconnectInterval = RECONNECT_INTERVAL_MS
    lastError = null
    broadcastStatus(true)
    sendToChannel({ type: 'ping', paramsSource })
  }

  ws.onclose = (event) => {
    if (!lastError) {
      lastError = event.code === 1006 ? 'Connection refused or dropped' : `WebSocket closed (${event.code})`
    }
    broadcastStatus(false)
    scheduleReconnect()
  }

  ws.onerror = () => {
    lastError = `Cannot connect to ws://127.0.0.1:${port}`
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      handleChannelMessage(msg)
    } catch { /* ignore malformed messages */ }
  }
}

/**
 * Main connect flow: URL params > saved params > show settings.
 */
async function connect() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return

  // URL path: params passed via web-ext --start-url "about:blank#foxcode-port=PORT&foxcode-password=PASS"
  const urlParams = await getParamsFromTabs(() => browser.tabs.query({}))
  if (urlParams && urlParams.port) {
    paramsSource = 'url'
    connectToServer(urlParams.port, urlParams.password)
    return
  }

  // Saved params from previous session
  const saved = await loadSavedParams()
  if (saved) {
    paramsSource = 'saved'
    connectToServer(saved.port, saved.password)
    return
  }

  // No params available - sidebar will show settings form
  paramsSource = null
  lastError = 'No connection params: no URL hash, no saved settings'
  if (sidebarPort) {
    broadcastStatus(false)
    sidebarPort.postMessage({ type: 'show-settings' })
  }
}

/**
 * Schedule a reconnection with exponential backoff.
 * Only retries with saved params (no scanning).
 */
function scheduleReconnect() {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null
    reconnectInterval = Math.min(reconnectInterval * 1.5, MAX_RECONNECT_INTERVAL_MS)
    // Retry with current active params
    if (activePort) {
      connectToServer(activePort, activePassword)
    } else {
      connect()
    }
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
    sidebarPort.postMessage({
      type: 'status',
      connected,
      port: activePort,
      source: paramsSource,
      error: connected ? null : lastError,
      reconnectIn: reconnectTimer ? Math.round(reconnectInterval / 1000) : null,
    })
  }
}

// --- Handle messages from channel server ---

function handleChannelMessage(msg) {
  switch (msg.type) {
    case 'pong':
      if (sidebarPort) sidebarPort.postMessage(msg)
      break

    case 'msg':
      // Channel connectivity test: auto-reply to confirm reverse path
      if (msg.text === 'ping') {
        sendToChannel({ type: 'message', text: 'pong', id: `ack-${msg.id}` })
      }
      if (sidebarPort) sidebarPort.postMessage(msg)
      break

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

  // If connected, request fresh server info so sidebar gets pong with details
  if (connected) {
    sendToChannel({ type: 'ping' })
  }

  // If not connected and no active params, prompt settings
  if (!connected && !activePort) {
    port.postMessage({ type: 'show-settings' })
  }

  port.onMessage.addListener((msg) => {
    switch (msg.type) {
      case 'message': {
        const sent = sendToChannel(msg)
        if (!sent && sidebarPort) {
          sidebarPort.postMessage({ type: 'send-failed', text: 'Message not delivered — no connection' })
        }
        break
      }
      case 'connect':
        connect()
        break
      case 'update-settings':
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
        reconnectInterval = RECONNECT_INTERVAL_MS
        if (ws) { ws.onclose = null; ws.close(); ws = null }
        activePort = null
        activePassword = null
        paramsSource = 'manual'
        lastError = null
        connectToServer(msg.port, msg.password)
        break
    }
  })

  port.onDisconnect.addListener(() => {
    sidebarPort = null
  })
})

// Start connection
connect()
