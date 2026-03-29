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

// Must match BASE_PORT/PORT_RANGE in foxcode/channel/lib.mjs (no shared module between Node.js and WebExtension)
const BASE_PORT = 8787
const PORT_RANGE = 100
const RECONNECT_INTERVAL_MS = 3000
const MAX_RECONNECT_INTERVAL_MS = 30000
const PROBE_TIMEOUT_MS = 1500

const STORAGE_KEY = 'foxcode_last_port'

let ws = null
let reconnectTimer = null
let reconnectInterval = RECONNECT_INTERVAL_MS
let sidebarPort = null
let activePort = null

/** Last discovered servers list: [{port, server, version, pid, pluginRoot, uptime, ...}] */
let discoveredServers = []

/** Save selected port to extension storage for persistence across restarts. */
function savePort(port) {
  browser.storage.local.set({ [STORAGE_KEY]: port })
}

/** Load last selected port from extension storage. Returns port number or null. */
async function loadSavedPort() {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY)
    return result[STORAGE_KEY] ?? null
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

// --- Port discovery & WebSocket connection ---

/**
 * Probe a single port: open WebSocket, send ping, wait for pong with telemetry.
 * Returns pong data or null on failure/timeout.
 */
function probePort(port) {
  return new Promise((resolve) => {
    let settled = false
    let probe
    function settle(result) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (probe && probe.readyState <= WebSocket.OPEN) probe.close()
      resolve(result)
    }
    const timer = setTimeout(() => settle(null), PROBE_TIMEOUT_MS)
    try {
      probe = new WebSocket(`ws://127.0.0.1:${port}`)
    } catch { settle(null); return }

    probe.onopen = () => { probe.send(JSON.stringify({ type: 'ping' })) }
    probe.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'pong') settle({ ...msg, port })
      } catch { /* ignore */ }
    }
    probe.onerror = () => settle(null)
    probe.onclose = () => settle(null)
  })
}

/**
 * Scan all ports in range in batches to avoid excessive parallel connections.
 * Returns array of pong objects sorted by port.
 */
async function discoverServers() {
  const BATCH_SIZE = 20
  const found = []
  for (let i = 0; i < PORT_RANGE; i += BATCH_SIZE) {
    const batch = []
    for (let j = i; j < Math.min(i + BATCH_SIZE, PORT_RANGE); j++) {
      batch.push(probePort(BASE_PORT + j))
    }
    const results = await Promise.all(batch)
    for (const r of results) if (r) found.push(r)
  }
  return found.sort((a, b) => a.port - b.port)
}

/**
 * Connect to a specific port. Sets up message routing and reconnect on close.
 */
function connectToPort(port) {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    if (activePort === port) return
    ws.close()
  }

  try {
    ws = new WebSocket(`ws://127.0.0.1:${port}`)
  } catch {
    scheduleReconnect()
    return
  }
  activePort = port
  savePort(port)

  ws.onopen = () => {
    reconnectInterval = RECONNECT_INTERVAL_MS
    broadcastStatus(true)
    sendToChannel({ type: 'ping' })
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
 * Main connect flow: discover servers, auto-connect or notify sidebar for picker.
 */
async function connect() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return

  discoveredServers = await discoverServers()
  if (sidebarPort) sidebarPort.postMessage({ type: 'servers', list: discoveredServers, activePort })

  if (discoveredServers.length === 0) {
    broadcastStatus(false)
    scheduleReconnect()
    return
  }

  // Auto-connect: prefer saved/active port if still available, else first server
  const savedPort = activePort ?? await loadSavedPort()
  const target = (savedPort && discoveredServers.find(s => s.port === savedPort)) || discoveredServers[0]
  connectToPort(target.port)
}

/**
 * Schedule a reconnection with exponential backoff.
 * On each reconnect, re-scan all ports (server may have moved).
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

  // Send current connection status and known servers
  const connected = ws && ws.readyState === WebSocket.OPEN
  port.postMessage({ type: 'status', connected })
  if (discoveredServers.length > 0) {
    port.postMessage({ type: 'servers', list: discoveredServers, activePort })
  }

  port.onMessage.addListener((msg) => {
    switch (msg.type) {
      case 'message':
        sendToChannel(msg)
        break
      case 'connect':
        connect()
        break
      case 'select-server':
        if (msg.port) connectToPort(msg.port)
        break
      case 'rescan':
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
        reconnectInterval = RECONNECT_INTERVAL_MS
        if (ws) { ws.onclose = null; ws.close(); ws = null }
        activePort = null
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
