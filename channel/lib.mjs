/**
 * FoxCode — Channel plugin shared logic.
 * Pure functions and protocol definitions, testable without MCP/WebSocket.
 */

/**
 * Sequence counter for message IDs.
 * Exposed as object so tests can reset it.
 */
export const state = { seq: 0 }

/** Generate a unique message ID. */
export function nextId() {
  return `m${Date.now()}-${++state.seq}`
}

/**
 * Build channel notification metadata from an extension message.
 * @param {object} msg - Extension message with id, tab?, text
 * @returns {{content: string, meta: object}}
 */
export function buildChannelMeta(msg) {
  const id = msg.id || nextId()
  const meta = { chat_id: 'web', message_id: id, user: 'web', ts: new Date().toISOString() }
  if (msg.tab?.url) meta.tab_url = msg.tab.url
  if (msg.tab?.title) meta.tab_title = msg.tab.title
  return { content: msg.text, meta }
}

/**
 * Build a reply broadcast message for the extension.
 * @param {string} text - Reply text
 * @param {string} [replyTo] - Message ID to reply to
 * @returns {object}
 */
export function buildReplyMessage(text, replyTo) {
  const id = nextId()
  return { type: 'msg', id, from: 'assistant', text, ts: Date.now(), replyTo }
}

/**
 * Build an edit broadcast message.
 * @param {string} messageId
 * @param {string} text
 * @returns {object}
 */
export function buildEditMessage(messageId, text) {
  return { type: 'edit', id: messageId, text }
}

/**
 * Build a tool_use broadcast message.
 * @param {string} tool
 * @param {object} params
 * @returns {object}
 */
export function buildToolUseMessage(tool, params) {
  const id = nextId()
  return { type: 'tool_use', id, tool, params, ts: Date.now() }
}

/**
 * Build a tool_result broadcast message.
 * @param {string} tool
 * @param {string} content
 * @returns {object}
 */
export function buildToolResultMessage(tool, content) {
  const id = nextId()
  return { type: 'tool_result', id, tool, content, ts: Date.now() }
}

/**
 * Assert that the MCP client (Claude Code) advertises claude/channel support.
 * Throws if the capability is missing — meaning Claude was launched without
 * --dangerously-load-development-channels server:<name>.
 * @param {object|undefined} clientCapabilities - from mcp.getClientCapabilities()
 */
export function assertChannelCapability(clientCapabilities, serverName = 'foxcode') {
  if (!clientCapabilities?.experimental?.['claude/channel']) {
    throw new Error(
      'Client does not support claude/channel. ' +
      `Start Claude Code with: claude --dangerously-load-development-channels server:${serverName}`
    )
  }
}

/**
 * MCP tool definitions exposed by the channel plugin.
 */
export const TOOL_DEFINITIONS = [
  {
    name: 'reply',
    description: 'Send a message to the Firefox browser sidebar.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Message text' },
        reply_to: { type: 'string', description: 'Message ID to reply to (optional)' },
      },
      required: ['text'],
    },
  },
  {
    name: 'edit_message',
    description: 'Edit a previously sent message in the browser sidebar.',
    inputSchema: {
      type: 'object',
      properties: {
        message_id: { type: 'string', description: 'ID of the message to edit' },
        text: { type: 'string', description: 'New message text' },
      },
      required: ['message_id', 'text'],
    },
  },
  {
    name: 'evalInBrowser',
    description: [
      'Execute JavaScript in Firefox browser. Code runs in extension background with async browser API.',
      'Multi-page workflows supported (survives navigation).',
      'navigate() automatically opens a new tab for agent work (preserves user\'s active tab).',
      'Subsequent operations target this managed tab. closeTab() without args closes it;',
      'next navigate() creates a fresh tab.',
      '',
      'Usage: write JS code using `api` object. Destructure or access directly.',
      'All selector-based helpers auto-wait for element (poll 100ms, default timeout 2000ms).',
      'Override: pass {timeout: 5000} as last arg.',
      '',
      'API Reference:',
      '- Wait: api.waitFor(sel, {timeout?,visible?})',
      '- DOM: api.click(sel,opts?), api.dblclick(sel,opts?), api.type(sel,text,opts?),',
      '  api.fill(sel,val,opts?), api.select(sel,val,opts?), api.check(sel,opts?),',
      '  api.uncheck(sel,opts?), api.hover(sel,opts?), api.press(key),',
      '  api.scrollTo(x,y), api.scrollBy(dx,dy)',
      '- Query: api.$(sel,opts?), api.$$(sel,opts?), api.snapshot(sel?,opts?),',
      '  api.getTitle(), api.getUrl(), api.getSelectedText()',
      '- Eval: api.eval(expr) — execute in page JS context (access page vars, React state)',
      '- Navigation: api.navigate(url), api.goBack(), api.goForward(), api.reload()',
      '  — all await page load',
      '- Tabs: api.getTabs(), api.newTab(url?), api.closeTab(idx?), api.selectTab(idx)',
      '  closeTab() without args closes managed tab; with idx closes by index',
      '- Storage: api.localStorage.{list,get,set,delete,clear}(),',
      '  api.sessionStorage.{…}()',
      '- Cookies: api.getCookies(filter?), api.setCookie(details),',
      '  api.deleteCookie(name,url)',
      '- Window: api.resize(w,h), api.screenshot() → base64',
      '- Dialog: api.interceptDialog("accept"|"dismiss")',
      '- Console: api.captureConsole(), api.getConsoleLogs()',
      '',
      'opts = {timeout: ms} — override auto-wait timeout per call',
      '',
      'Example:',
      'const {navigate, fill, click, snapshot} = api;',
      'await navigate("https://example.com/login");',
      'await fill("#email", "user@test.com");',
      'await click("button[type=submit]");',
      'return await snapshot();',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'JS code. Use `api.*` helpers. Async/await supported. Return value = tool result.',
        },
        timeout: {
          type: 'number',
          description: 'Timeout ms, default 30000',
        },
      },
      required: ['code'],
    },
  },
]
