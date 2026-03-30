/**
 * FoxCode - Popup UI (eval debug console).
 * Connects to background script, renders evalInBrowser requests/responses.
 */

const messagesEl = document.getElementById('messages')
const noSessionsEl = document.getElementById('no-sessions')

// --- Connect to background ---

const port = browser.runtime.connect({ name: 'popup' })

port.onMessage.addListener((msg) => {
  switch (msg.type) {
    case 'session-update':
      updateSessionState(msg.sessions)
      break
    case 'buffered-messages':
      for (const m of msg.messages) {
        appendEvalMessage(m)
      }
      scrollToBottom(true)
      break
    case 'tool_use':
      appendEvalMessage(msg)
      scrollToBottom()
      break
    case 'tool_result':
      appendEvalMessage(msg)
      scrollToBottom()
      break
  }
})

port.onDisconnect.addListener(() => {
  updateSessionState([])
})

// --- Session state (no bar, just show/hide no-sessions) ---

function updateSessionState(sessionsList) {
  if (sessionsList.length === 0) {
    noSessionsEl.classList.remove('hidden')
  } else {
    noSessionsEl.classList.add('hidden')
  }
}

// --- Eval messages ---

function appendEvalMessage(msg) {
  noSessionsEl.classList.add('hidden')

  const div = document.createElement('div')
  div.className = `message ${msg.type}`
  div.id = `msg-${msg.id}`

  const body = document.createElement('div')
  body.className = 'body'

  if (msg.type === 'tool_use') {
    body.textContent = `> ${msg.tool}(${formatToolParams(msg.params)})`
  } else if (msg.type === 'tool_result') {
    const preview = msg.content.length > 200 ? msg.content.slice(0, 200) + '…' : msg.content
    body.textContent = `< ${preview}`
  }

  div.appendChild(body)
  messagesEl.appendChild(div)
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

// formatToolParams is loaded from format.js
