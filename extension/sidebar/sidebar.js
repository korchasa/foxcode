/**
 * FoxCode - Sidebar UI.
 * Connects to background script, renders messages, handles input.
 */

const STORAGE_KEY_PORT = 'foxcode_last_port'
const STORAGE_KEY_PASSWORD = 'foxcode_last_password'

const messagesEl = document.getElementById('messages')
const inputEl = document.getElementById('input')
const formEl = document.getElementById('input-form')
const serverIndicatorEl = document.getElementById('server-indicator')
const settingsFormEl = document.getElementById('settings-form')
const settingsPortEl = document.getElementById('settings-port')
const settingsPasswordEl = document.getElementById('settings-password')
const settingsConnectBtn = document.getElementById('settings-connect')

const messages = new Map()
let uid = 0
let thinkingEl = null
let currentTab = null

// --- Connect to background ---

const port = browser.runtime.connect({ name: 'sidebar' })

port.onMessage.addListener((msg) => {
  switch (msg.type) {
    case 'status':
      setStatus(msg.connected)
      break
    case 'show-settings':
      showSettings()
      break
    case 'pong':
      updateActiveServerInfo(msg)
      break
    case 'msg':
      removeThinking()
      addMessage(msg)
      break
    case 'edit':
      editMessage(msg.id, msg.text)
      break
    case 'tool_use':
      addToolUseMessage(msg)
      break
    case 'tool_result':
      addToolResultMessage(msg)
      break
    case 'send-failed':
      removeThinking()
      showSendError(msg.text || 'Message not delivered — no connection')
      break
  }
})

port.onDisconnect.addListener(() => setStatus(false))
port.postMessage({ type: 'connect' })

// --- Track active tab ---

async function updateCurrentTab() {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true })
    currentTab = tabs[0] ? { url: tabs[0].url, title: tabs[0].title } : null
  } catch {
    currentTab = null
  }
}

updateCurrentTab()
browser.tabs.onActivated.addListener(() => updateCurrentTab())
browser.tabs.onUpdated.addListener((_id, changeInfo) => {
  if (changeInfo.title || changeInfo.url) updateCurrentTab()
})

// --- Status ---

const connectionErrorEl = document.getElementById('connection-error')

function setStatus(connected) {
  if (connected) {
    inputEl.classList.remove('disconnected')
    inputEl.placeholder = 'Ask a question about this page...'
    inputEl.disabled = false
    connectionErrorEl.classList.add('hidden')
    serverIndicatorEl.classList.add('connected')
    hideSettings()
  } else {
    inputEl.classList.add('disconnected')
    inputEl.placeholder = 'No connection...'
    inputEl.disabled = true
    connectionErrorEl.classList.remove('hidden')
    serverIndicatorEl.classList.remove('connected')
    serverIndicatorEl.textContent = 'No connection'
  }
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

// --- Thinking indicator ---

const THINKING_TIMEOUT_MS = 60000
let thinkingTimer = null

function showThinking() {
  removeThinking()
  thinkingEl = document.createElement('div')
  thinkingEl.className = 'message thinking'
  thinkingEl.innerHTML = '<div class="thinking-dots"><span>.</span><span>.</span><span>.</span></div>'
  messagesEl.appendChild(thinkingEl)
  scrollToBottom()
  thinkingTimer = setTimeout(() => {
    removeThinking()
  }, THINKING_TIMEOUT_MS)
}

function removeThinking() {
  if (thinkingTimer) {
    clearTimeout(thinkingTimer)
    thinkingTimer = null
  }
  if (thinkingEl) {
    thinkingEl.remove()
    thinkingEl = null
  }
}

function showSendError(text) {
  const div = document.createElement('div')
  div.className = 'message send-error'
  div.textContent = text
  messagesEl.appendChild(div)
  scrollToBottom(true)
  setTimeout(() => div.remove(), 5000)
}

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
}

function projectLabel(server) {
  const path = server.projectDir || server.pluginRoot
  if (!path) return `port ${server.port}`
  const rel = path.replace(/^(?:\/(?:Users|home)\/[^/]+\/|[A-Z]:\\Users\\[^\\]+\\)/, '')
  const segments = rel.replace(/[\\/]+$/, '').split(/[\\/]/)
  return segments.length > 2 ? segments.slice(-2).join('/') : rel
}

// --- Send message ---

formEl.addEventListener('submit', async (e) => {
  e.preventDefault()
  const text = inputEl.value.trim()
  if (!text) return

  const id = `u-${Date.now()}-${++uid}`
  addMessage({ id, from: 'user', text, ts: Date.now() })

  port.postMessage({ type: 'message', id, text, tab: currentTab })
  showThinking()

  inputEl.value = ''
  inputEl.style.height = ''
  inputEl.focus()
})

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    formEl.requestSubmit()
  }
})

// Auto-resize textarea
inputEl.addEventListener('input', () => {
  inputEl.style.height = 'auto'
  inputEl.style.height = inputEl.scrollHeight + 'px'
})
