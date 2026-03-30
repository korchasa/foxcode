/**
 * FoxCode - Background script.
 * Manages multiple WebSocket connections (one per MCP server session)
 * and routes messages between sidebar, content script, and channel servers.
 *
 * EVAL_CODE handler: executes agent JS code with injected browser API object.
 * Concurrent eval requests from different sessions are serialized via queue.
 */

/* global browser, WebSocket */

const RECONNECT_INTERVAL_MS = 3000
const MAX_RECONNECT_INTERVAL_MS = 30000
const MAX_RECONNECT_ATTEMPTS = 10

const STORAGE_KEY_SESSIONS = 'foxcode_sessions'

/** @type {Map<number, Session>} port → session */
const sessions = new Map()

let popupPort = null

/** Buffered eval messages for popup replay. */
const evalBuffer = []
const EVAL_BUFFER_MAX = 200
let unreadEvalCount = 0

/**
 * @typedef {Object} Session
 * @property {WebSocket} ws
 * @property {number} port
 * @property {string|null} password
 * @property {string} paramsSource - 'url' | 'saved'
 * @property {number|null} reconnectTimer
 * @property {number} reconnectInterval
 * @property {number} reconnectAttempts
 * @property {object|null} meta - filled from pong {projectDir, version, pid}
 * @property {string|null} lastError
 */

// --- Storage ---

function saveSessions() {
  const arr = []
  for (const [port, s] of sessions) {
    arr.push({ port, password: s.password })
  }
  browser.storage.local.set({ [STORAGE_KEY_SESSIONS]: arr })
}

async function loadSessions() {
  try {
    const result = await browser.storage.local.get([STORAGE_KEY_SESSIONS])
    return result[STORAGE_KEY_SESSIONS] || []
  } catch {
    return []
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

// --- Multi-session WebSocket connections ---

/**
 * Connect to a specific MCP server. Adds to sessions Map without closing others.
 */
function connectToServer(port, password, source) {
  const existing = sessions.get(port)
  if (existing && (existing.ws.readyState === WebSocket.CONNECTING || existing.ws.readyState === WebSocket.OPEN)) {
    return // already connected or connecting
  }

  let ws
  try {
    const url = password
      ? `ws://127.0.0.1:${port}?token=${encodeURIComponent(password)}`
      : `ws://127.0.0.1:${port}`
    ws = new WebSocket(url)
  } catch {
    if (existing) {
      scheduleReconnect(port)
    }
    return
  }

  const session = existing || {
    ws: null,
    port,
    password,
    paramsSource: source,
    reconnectTimer: null,
    reconnectInterval: RECONNECT_INTERVAL_MS,
    reconnectAttempts: 0,
    meta: null,
    lastError: null,
  }
  session.ws = ws
  session.password = password
  sessions.set(port, session)

  ws.onopen = () => {
    session.reconnectInterval = RECONNECT_INTERVAL_MS
    session.reconnectAttempts = 0
    session.lastError = null
    saveSessions()
    notifyPopupSessions()
    ws.send(JSON.stringify({ type: 'ping', paramsSource: source }))
  }

  ws.onclose = (event) => {
    if (!session.lastError) {
      session.lastError = event.code === 1006 ? 'Connection refused or dropped' : `WebSocket closed (${event.code})`
    }
    notifyPopupSessions()
    scheduleReconnect(port)
  }

  ws.onerror = () => {
    session.lastError = `Cannot connect to ws://127.0.0.1:${port}`
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      handleChannelMessage(msg, port)
    } catch { /* ignore malformed messages */ }
  }
}

/**
 * Initial connect flow: URL hash params → saved sessions.
 */
async function connect() {
  // URL path: params from tabs with #foxcode-port=
  const urlParams = await getParamsFromTabs(() => browser.tabs.query({}))
  for (const { port, password } of urlParams) {
    connectToServer(port, password, 'url')
  }

  // Saved sessions from previous run
  const saved = await loadSessions()
  for (const { port, password } of saved) {
    if (!sessions.has(port)) {
      connectToServer(port, password, 'saved')
    }
  }

  // If nothing found, popup shows "no sessions" state
  if (sessions.size === 0) {
    notifyPopupSessions()
  }
}

/**
 * Schedule reconnection for a specific session with exponential backoff.
 */
function scheduleReconnect(port) {
  const session = sessions.get(port)
  if (!session || session.reconnectTimer) return

  session.reconnectAttempts++
  if (session.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    sessions.delete(port)
    saveSessions()
    notifyPopupSessions()
    return
  }

  session.reconnectTimer = setTimeout(() => {
    session.reconnectTimer = null
    session.reconnectInterval = Math.min(session.reconnectInterval * 2, MAX_RECONNECT_INTERVAL_MS)
    connectToServer(session.port, session.password, session.paramsSource)
  }, session.reconnectInterval)
}

function notifyPopupSessions() {
  if (!popupPort) return
  const list = []
  for (const [port, s] of sessions) {
    list.push({
      port,
      connected: s.ws && s.ws.readyState === WebSocket.OPEN,
      meta: s.meta,
      lastError: s.lastError,
    })
  }
  popupPort.postMessage({ type: 'session-update', sessions: list })
}

// --- Handle messages from channel server ---

function handleChannelMessage(msg, sessionPort) {
  switch (msg.type) {
    case 'pong': {
      const session = sessions.get(sessionPort)
      if (session) {
        session.meta = {
          projectDir: msg.projectDir,
          version: msg.version,
          pid: msg.pid,
        }
      }
      notifyPopupSessions()
      break
    }

    case 'tool_use':
    case 'tool_result':
      bufferEvalMessage({ ...msg, sessionPort })
      if (popupPort) popupPort.postMessage({ ...msg, sessionPort })
      break

    case 'tool_request':
      handleToolRequest(msg, sessionPort)
      break
  }
}

// --- evalInBrowser serialization queue ---

const evalQueue = []
let evalRunning = false

function handleToolRequest(msg, sessionPort) {
  evalQueue.push({ msg, sessionPort })
  processEvalQueue()
}

async function processEvalQueue() {
  if (evalRunning || evalQueue.length === 0) return
  evalRunning = true

  const { msg, sessionPort } = evalQueue.shift()
  const { request_id, tool, params } = msg
  const session = sessions.get(sessionPort)

  // Skip if session is dead — WS closed, can't respond; server will timeout
  if (!session || session.ws.readyState !== WebSocket.OPEN) {
    console.warn(`foxcode: dropping eval request ${request_id} — session :${sessionPort} disconnected`)
    evalRunning = false
    processEvalQueue()
    return
  }

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
    if (session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ type: 'tool_response', request_id, content }))
    }
  } catch (err) {
    const errorResult = { ok: false, error: err.message, stack: err.stack }
    if (session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ type: 'tool_response', request_id, content: JSON.stringify(errorResult) }))
    }
  }

  evalRunning = false
  processEvalQueue()
}

// --- Eval message buffer ---

function bufferEvalMessage(msg) {
  if (evalBuffer.length >= EVAL_BUFFER_MAX) {
    evalBuffer.shift()
  }
  evalBuffer.push(msg)
  if (!popupPort) {
    unreadEvalCount++
    updateBadge()
  }
}

function updateBadge() {
  const text = unreadEvalCount > 0 ? String(unreadEvalCount) : ''
  browser.browserAction.setBadgeText({ text })
  browser.browserAction.setBadgeBackgroundColor({ color: '#c2185b' })
}

// --- tabs.onUpdated listener for new session URLs ---

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) return
  const { port, password } = parseFoxcodeParams(changeInfo.url)
  if (port) {
    connectToServer(port, password, 'url')
  }
})

// --- Handle messages from popup ---

browser.runtime.onConnect.addListener((port) => {
  if (port.name !== 'popup') return
  popupPort = port

  // Send buffered eval messages
  popupPort.postMessage({ type: 'buffered-messages', messages: evalBuffer })
  unreadEvalCount = 0
  updateBadge()

  notifyPopupSessions()

  // Request fresh server info from connected sessions
  for (const [, s] of sessions) {
    if (s.ws && s.ws.readyState === WebSocket.OPEN) {
      s.ws.send(JSON.stringify({ type: 'ping', paramsSource: s.paramsSource }))
    }
  }

  port.onDisconnect.addListener(() => {
    popupPort = null
  })
})

// Start connection
connect()
