/**
 * FoxCode — Sidebar UI.
 * Connects to background script, renders messages, handles input.
 */

const messagesEl = document.getElementById('messages')
const inputEl = document.getElementById('input')
const formEl = document.getElementById('input-form')
const serverBarEl = document.getElementById('server-bar')
const serverIndicatorEl = document.getElementById('server-indicator')
const serverPickerEl = document.getElementById('server-picker')
const serverListEl = document.getElementById('server-list')
const rescanBtnEl = document.getElementById('rescan-btn')

const messages = new Map()
let uid = 0
let thinkingEl = null
let currentTab = null
let knownServers = []
let currentActivePort = null

// --- Connect to background ---

const port = browser.runtime.connect({ name: 'sidebar' })

port.onMessage.addListener((msg) => {
  switch (msg.type) {
    case 'status':
      setStatus(msg.connected)
      break
    case 'servers':
      updateServerList(msg.list, msg.activePort)
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
  } else {
    inputEl.classList.add('disconnected')
    inputEl.placeholder = 'No connection...'
    inputEl.disabled = true
    connectionErrorEl.classList.remove('hidden')
  }
}

// --- Thinking indicator ---

function showThinking() {
  removeThinking()
  thinkingEl = document.createElement('div')
  thinkingEl.className = 'message thinking'
  thinkingEl.innerHTML = '<div class="thinking-dots"><span>.</span><span>.</span><span>.</span></div>'
  messagesEl.appendChild(thinkingEl)
  scrollToBottom()
}

function removeThinking() {
  if (thinkingEl) {
    thinkingEl.remove()
    thinkingEl = null
  }
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

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight
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

// --- Server picker ---

/**
 * Extract a short project label from server telemetry.
 * Uses projectDir (FOXCODE_PROJECT_DIR) when available, falls back to pluginRoot.
 * e.g. "/Users/foo/www/4ra" → "4ra"
 * e.g. "/home/foo/www/sandbox/foxcode" → "sandbox/foxcode"
 */
function projectLabel(server) {
  const path = server.projectDir || server.pluginRoot
  if (!path) return `port ${server.port}`
  // Strip home dir prefix on any platform: /Users/x/..., /home/x/..., C:\Users\x\...
  const rel = path.replace(/^(?:\/(?:Users|home)\/[^/]+\/|[A-Z]:\\Users\\[^\\]+\\)/, '')
  const segments = rel.replace(/[\\/]+$/, '').split(/[\\/]/)
  return segments.length > 2 ? segments.slice(-2).join('/') : rel
}

function updateServerList(servers, activePort) {
  knownServers = servers
  currentActivePort = activePort

  if (servers.length === 0) {
    serverIndicatorEl.textContent = 'No servers found'
    serverIndicatorEl.style.cursor = 'default'
    serverListEl.innerHTML = ''
    return
  }

  // Update indicator text
  const active = servers.find(s => s.port === activePort) || servers[0]
  serverIndicatorEl.textContent = projectLabel(active)

  // Only show picker toggle if multiple servers
  serverIndicatorEl.style.cursor = servers.length > 1 ? 'pointer' : 'default'

  // Render picker list
  serverListEl.innerHTML = ''
  for (const s of servers) {
    const item = document.createElement('div')
    item.className = 'server-list-item' + (s.port === activePort ? ' active' : '')

    const name = document.createElement('div')
    name.className = 'server-list-item-name'
    name.textContent = projectLabel(s)

    const detail = document.createElement('div')
    detail.className = 'server-list-item-detail'
    const uptimeMin = Math.floor(s.uptime / 60)
    detail.textContent = `:${s.port} | v${s.version} | pid ${s.pid} | up ${uptimeMin}m`

    item.appendChild(name)
    item.appendChild(detail)
    item.addEventListener('click', () => {
      port.postMessage({ type: 'select-server', port: s.port })
      serverPickerEl.classList.add('hidden')
    })
    serverListEl.appendChild(item)
  }
}

function updateActiveServerInfo(pong) {
  currentActivePort = pong.port
  const active = knownServers.find(s => s.port === pong.port)
  if (active) {
    Object.assign(active, pong)
  }
  serverIndicatorEl.textContent = projectLabel(pong)
}

// Toggle picker on indicator click
serverIndicatorEl.addEventListener('click', () => {
  if (knownServers.length > 1) {
    serverPickerEl.classList.toggle('hidden')
  }
})

// Rescan button
rescanBtnEl.addEventListener('click', () => {
  serverPickerEl.classList.add('hidden')
  port.postMessage({ type: 'rescan' })
})

// Close picker on outside click
document.addEventListener('click', (e) => {
  if (!serverBarEl.contains(e.target)) {
    serverPickerEl.classList.add('hidden')
  }
})

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
