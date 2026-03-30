/**
 * FoxCode - Sidebar UI.
 * Connects to background script, renders messages from Claude Code.
 */

const STORAGE_KEY_PORT = 'foxcode_last_port'
const STORAGE_KEY_PASSWORD = 'foxcode_last_password'

const messagesEl = document.getElementById('messages')
const serverIndicatorEl = document.getElementById('server-indicator')
const settingsFormEl = document.getElementById('settings-form')
const settingsPortEl = document.getElementById('settings-port')
const settingsPasswordEl = document.getElementById('settings-password')
const settingsConnectBtn = document.getElementById('settings-connect')

const messages = new Map()

// --- Connect to background ---

const port = browser.runtime.connect({ name: 'sidebar' })

port.onMessage.addListener((msg) => {
  switch (msg.type) {
    case 'status':
      setStatus(msg.connected, msg)
      break
    case 'show-settings':
      showSettings()
      break
    case 'pong':
      setStatus(true)
      updateActiveServerInfo(msg)
      break
    case 'msg':
      setStatus(true)
      addMessage(msg)
      break
    case 'edit':
      editMessage(msg.id, msg.text)
      break
    case 'tool_use':
      setStatus(true)
      addToolUseMessage(msg)
      break
    case 'tool_result':
      setStatus(true)
      addToolResultMessage(msg)
      break
  }
})

port.onDisconnect.addListener(() => setStatus(false))
port.postMessage({ type: 'connect' })

// --- Status ---

const connectionErrorEl = document.getElementById('connection-error')
const connectionDiagEl = document.getElementById('connection-diag')

const SOURCE_LABELS = {
  url: 'URL hash params',
  saved: 'saved from previous session',
  manual: 'manual settings',
}

let isConnected = false

function setStatus(connected, diag) {
  isConnected = connected
  if (connected) {
    connectionErrorEl.classList.add('hidden')
    serverIndicatorEl.classList.add('connected')
    if (!serverIndicatorEl.dataset.hasServerInfo) {
      serverIndicatorEl.textContent = 'Connected'
    }
    hideSettings()
  } else {
    connectionErrorEl.classList.remove('hidden')
    serverIndicatorEl.classList.remove('connected')
    serverIndicatorEl.textContent = 'No connection'
    serverIndicatorEl.dataset.hasServerInfo = ''
    updateDiag(diag)
  }
}

function updateDiag(diag) {
  if (!diag || !connectionDiagEl) return
  const lines = []
  if (diag.port) lines.push(`Port: ${diag.port}`)
  if (diag.source) lines.push(`Source: ${SOURCE_LABELS[diag.source] || diag.source}`)
  if (diag.error) lines.push(`Error: ${diag.error}`)
  if (diag.reconnectIn) lines.push(`Retry in: ~${diag.reconnectIn}s`)
  connectionDiagEl.textContent = lines.join('\n')
}

// --- Settings form ---

function showSettings() {
  // Populate from storage if available
  browser.storage.local.get([STORAGE_KEY_PORT, STORAGE_KEY_PASSWORD]).then((result) => {
    if (result[STORAGE_KEY_PORT]) settingsPortEl.value = result[STORAGE_KEY_PORT]
    if (result[STORAGE_KEY_PASSWORD]) settingsPasswordEl.value = result[STORAGE_KEY_PASSWORD]
  }).catch(() => {})
  settingsFormEl.classList.remove('hidden')
}

function hideSettings() {
  settingsFormEl.classList.add('hidden')
}

settingsConnectBtn.addEventListener('click', () => {
  const p = parseInt(settingsPortEl.value, 10)
  const pw = settingsPasswordEl.value.trim()
  if (!p || p < 1 || p > 65535) return
  port.postMessage({ type: 'update-settings', port: p, password: pw || null })
})

// Toggle settings on indicator click
serverIndicatorEl.addEventListener('click', () => {
  settingsFormEl.classList.toggle('hidden')
})

// --- Messages ---

function addMessage(msg) {
  const div = document.createElement('div')
  div.className = `message ${msg.from}`
  div.id = `msg-${msg.id}`

  const meta = document.createElement('div')
  meta.className = 'meta'
  const time = new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const author = document.createElement('span')
  author.className = 'author'
  author.textContent = msg.from === 'user' ? 'You' : 'Claude'
  const timeEl = document.createElement('span')
  timeEl.className = 'time'
  timeEl.textContent = time
  meta.appendChild(author)
  meta.appendChild(timeEl)
  div.appendChild(meta)

  const body = document.createElement('div')
  body.className = 'body'
  if (msg.from === 'assistant') {
    body.innerHTML = renderMarkdown(msg.text)
  } else {
    body.textContent = msg.text
  }
  div.appendChild(body)

  messagesEl.appendChild(div)
  messages.set(msg.id, div)
  scrollToBottom()
}

function editMessage(id, text) {
  const el = messages.get(id)
  if (!el) return
  const body = el.querySelector('.body')
  if (body) {
    if (el.classList.contains('assistant')) {
      body.innerHTML = renderMarkdown(text)
    } else {
      body.textContent = text
    }
  }
}

function isNearBottom() {
  const threshold = 80
  return messagesEl.scrollTop + messagesEl.clientHeight >= messagesEl.scrollHeight - threshold
}

function scrollToBottom(force = false) {
  if (force || isNearBottom()) {
    messagesEl.scrollTop = messagesEl.scrollHeight
  }
}

// --- Tool use/result messages ---

function addToolUseMessage(msg) {
  const div = document.createElement('div')
  div.className = 'message tool-use'
  div.id = `msg-${msg.id}`

  const body = document.createElement('div')
  body.className = 'body'
  body.textContent = `🔧 ${msg.tool}(${formatToolParams(msg.params)})`
  div.appendChild(body)

  messagesEl.appendChild(div)
  messages.set(msg.id, div)
  scrollToBottom()
}

function addToolResultMessage(msg) {
  const div = document.createElement('div')
  div.className = 'message tool-result'
  div.id = `msg-${msg.id}`

  const body = document.createElement('div')
  body.className = 'body'
  const preview = msg.content.length > 200 ? msg.content.slice(0, 200) + '…' : msg.content
  body.textContent = `✅ ${preview}`
  div.appendChild(body)

  messagesEl.appendChild(div)
  messages.set(msg.id, div)
  scrollToBottom()
}

// formatParamValue and formatToolParams are loaded from format.js

// --- Server info ---

function updateActiveServerInfo(pong) {
  const label = projectLabel(pong)
  const uptimeMin = Math.floor((pong.uptime || 0) / 60)
  serverIndicatorEl.textContent = `${label} :${pong.port} | v${pong.version} | up ${uptimeMin}m`
  serverIndicatorEl.dataset.hasServerInfo = '1'
}

function projectLabel(server) {
  const path = server.projectDir || server.pluginRoot
  if (!path) return `port ${server.port}`
  const rel = path.replace(/^(?:\/(?:Users|home)\/[^/]+\/|[A-Z]:\\Users\\[^\\]+\\)/, '')
  const segments = rel.replace(/[\\/]+$/, '').split(/[\\/]/)
  return segments.length > 2 ? segments.slice(-2).join('/') : rel
}
