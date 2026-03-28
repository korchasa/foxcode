/**
 * FoxCode — Sidebar UI.
 * Connects to background script, renders messages, handles input.
 */

const messagesEl = document.getElementById('messages')
const inputEl = document.getElementById('input')
const formEl = document.getElementById('input-form')

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

function formatToolParams(params) {
  if (!params || Object.keys(params).length === 0) return ''
  return Object.entries(params)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join(', ')
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
