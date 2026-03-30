/**
 * FoxCode - Sidebar UI.
 * Connects to background script, renders messages from multiple Claude Code sessions.
 * Messages are visually grouped by session (port-based color + project label).
 */

const messagesEl = document.getElementById('messages')
const sessionListEl = document.getElementById('session-list')
const noSessionsEl = document.getElementById('no-sessions')

const messages = new Map()

/** Cached session meta from last session-update, keyed by port. */
const sessionMeta = new Map()

/** Session colors derived from port number. */
const SESSION_COLORS = [
  '#c2185b', '#1565c0', '#2e7d32', '#e65100', '#6a1b9a',
  '#00838f', '#ad1457', '#283593', '#558b2f', '#4e342e',
]

function sessionColor(port) {
  return SESSION_COLORS[port % SESSION_COLORS.length]
}

function projectLabel(meta, port) {
  if (!meta || !meta.projectDir) return `:${port}`
  const path = meta.projectDir
  const rel = path.replace(/^(?:\/(?:Users|home)\/[^/]+\/|[A-Z]:\\Users\\[^\\]+\\)/, '')
  const segments = rel.replace(/[\\/]+$/, '').split(/[\\/]/)
  const label = segments.length > 2 ? segments.slice(-2).join('/') : rel
  return `${label} :${port}`
}

// --- Connect to background ---

const port = browser.runtime.connect({ name: 'sidebar' })

port.onMessage.addListener((msg) => {
  switch (msg.type) {
    case 'session-update':
      updateSessionBar(msg.sessions)
      break
    case 'session-removed':
      removeSession(msg.port)
      break
    case 'pong':
      // pong updates are handled via session-update
      break
    case 'msg':
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

port.onDisconnect.addListener(() => {
  updateSessionBar([])
})
port.postMessage({ type: 'connect' })

// --- Session bar ---

let lastSessionPort = null

function updateSessionBar(sessionsList) {
  // Update meta cache
  for (const s of sessionsList) {
    if (s.meta) sessionMeta.set(s.port, s.meta)
  }

  if (sessionsList.length === 0) {
    noSessionsEl.classList.remove('hidden')
    sessionListEl.innerHTML = ''
    return
  }

  noSessionsEl.classList.add('hidden')

  // Build set of current ports for removal detection
  const currentPorts = new Set(sessionsList.map(s => s.port))

  // Remove stale items
  for (const el of [...sessionListEl.children]) {
    const p = Number(el.dataset.port)
    if (!currentPorts.has(p)) el.remove()
  }

  // Update or create items
  for (const s of sessionsList) {
    let el = sessionListEl.querySelector(`[data-port="${s.port}"]`)
    if (!el) {
      el = document.createElement('div')
      el.dataset.port = s.port
      el.style.setProperty('--session-color', sessionColor(s.port))

      const dot = document.createElement('span')
      dot.className = 'session-dot'
      el.appendChild(dot)

      const label = document.createElement('span')
      label.className = 'session-label'
      el.appendChild(label)

      sessionListEl.appendChild(el)
    }

    el.className = `session-item ${s.connected ? 'connected' : 'disconnected'}`
    el.querySelector('.session-label').textContent = projectLabel(s.meta, s.port)
    el.title = (!s.connected && s.lastError) ? s.lastError : ''
  }
}

function removeSession(sessionPort) {
  // Gray out messages from removed session
  const msgEls = messagesEl.querySelectorAll(`[data-session-port="${sessionPort}"]`)
  for (const el of msgEls) {
    el.classList.add('session-dead')
  }
}

// --- Messages ---

function maybeAddSessionDivider(sessionPort) {
  if (sessionPort && sessionPort !== lastSessionPort) {
    lastSessionPort = sessionPort
    const divider = document.createElement('div')
    divider.className = 'session-divider'
    divider.style.setProperty('--session-color', sessionColor(sessionPort))
    divider.textContent = projectLabel(sessionMeta.get(sessionPort) || null, sessionPort)
    divider.dataset.sessionPort = sessionPort
    messagesEl.appendChild(divider)
  }
}

function addMessage(msg) {
  maybeAddSessionDivider(msg.sessionPort)

  const div = document.createElement('div')
  div.className = `message ${msg.from}`
  div.id = `msg-${msg.id}`
  if (msg.sessionPort) {
    div.dataset.sessionPort = msg.sessionPort
    div.style.borderLeftColor = sessionColor(msg.sessionPort)
  }

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
  maybeAddSessionDivider(msg.sessionPort)

  const div = document.createElement('div')
  div.className = 'message tool-use'
  div.id = `msg-${msg.id}`
  if (msg.sessionPort) {
    div.dataset.sessionPort = msg.sessionPort
    div.style.borderLeftColor = sessionColor(msg.sessionPort)
  }

  const body = document.createElement('div')
  body.className = 'body'
  body.textContent = `🔧 ${msg.tool}(${formatToolParams(msg.params)})`
  div.appendChild(body)

  messagesEl.appendChild(div)
  messages.set(msg.id, div)
  scrollToBottom()
}

function addToolResultMessage(msg) {
  maybeAddSessionDivider(msg.sessionPort)

  const div = document.createElement('div')
  div.className = 'message tool-result'
  div.id = `msg-${msg.id}`
  if (msg.sessionPort) {
    div.dataset.sessionPort = msg.sessionPort
    div.style.borderLeftColor = sessionColor(msg.sessionPort)
  }

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
