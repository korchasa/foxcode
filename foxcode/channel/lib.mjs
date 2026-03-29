/**
 * FoxCode — Channel plugin shared logic.
 * Pure functions and protocol definitions, testable without MCP/WebSocket.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'

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
 * Check whether the MCP client (Claude Code) advertises claude/channel support.
 * @param {object|undefined} clientCapabilities - from mcp.getClientCapabilities()
 * @returns {boolean}
 */
export function hasChannelCapability(clientCapabilities) {
  return !!clientCapabilities?.experimental?.['claude/channel']
}

/**
 * Assert that the MCP client (Claude Code) advertises claude/channel support.
 * Throws if the capability is missing — meaning Claude was launched without
 * --dangerously-load-development-channels plugin:<name>@<marketplace>.
 * @param {object|undefined} clientCapabilities - from mcp.getClientCapabilities()
 */
export function assertChannelCapability(clientCapabilities, serverName = 'foxcode') {
  if (!hasChannelCapability(clientCapabilities)) {
    throw new Error(
      'Client does not support claude/channel. ' +
      `Start Claude Code with: claude --dangerously-load-development-channels plugin:${serverName}@korchasa`
    )
  }
}

/**
 * Build a pong response with server telemetry.
 * @param {{name: string, version: string, pid: number, port: number, uptime: number, clients: number, pendingRequests: number, nodeVersion: string, pluginRoot: string|undefined, projectDir: string|undefined}} env
 * @returns {object}
 */
export function buildPongMessage(env) {
  return {
    type: 'pong',
    server: env.name,
    version: env.version,
    pid: env.pid,
    port: env.port,
    uptime: env.uptime,
    clients: env.clients,
    pendingRequests: env.pendingRequests,
    nodeVersion: env.nodeVersion,
    pluginRoot: env.pluginRoot,
    projectDir: env.projectDir,
    ts: Date.now(),
  }
}

/**
 * Port range for WebSocket server auto-binding.
 * Server picks a random start within range to avoid collisions,
 * then wraps around. Persists last used port in ~/.foxcode/port.
 */
export const BASE_PORT = 8787
export const PORT_RANGE = 100

/** Default path to saved port file. */
export const PORT_FILE = join(homedir(), '.foxcode', 'port')

/**
 * Port persistence storage. Replaceable for testing.
 */
export const portStorage = {
  load() {
    try {
      const raw = readFileSync(PORT_FILE, 'utf8').trim()
      const n = Number(raw)
      return n >= BASE_PORT && n < BASE_PORT + PORT_RANGE ? n : null
    } catch {
      return null
    }
  },
  save(port) {
    mkdirSync(dirname(PORT_FILE), { recursive: true })
    writeFileSync(PORT_FILE, String(port), 'utf8')
  },
}

/**
 * Create a WebSocketServer bound to an available port in range.
 * Priority: explicitPort > saved port > random start, wrap around.
 * @param {typeof import('ws').WebSocketServer} WSSClass - WebSocketServer constructor
 * @param {number|null} explicitPort - If set, only try this port (FOXCODE_PORT override)
 * @returns {Promise<{wss: import('ws').WebSocketServer|null, port: number|null}>}
 */
export async function createWebSocketServer(WSSClass, explicitPort = null) {
  if (explicitPort != null) {
    return tryBindPort(WSSClass, explicitPort)
  }

  // Build port list: saved port first (if valid), then random-start wrap-around
  const saved = portStorage.load()
  const start = saved ?? (BASE_PORT + Math.floor(Math.random() * PORT_RANGE))
  const ports = []
  for (let i = 0; i < PORT_RANGE; i++) {
    ports.push(BASE_PORT + ((start - BASE_PORT + i) % PORT_RANGE))
  }

  for (const port of ports) {
    const result = await tryBindPort(WSSClass, port)
    if (result.wss) {
      portStorage.save(port)
      return result
    }
  }
  return { wss: null, port: null }
}

async function tryBindPort(WSSClass, port) {
  try {
    const wss = new WSSClass({ host: '127.0.0.1', port })
    await new Promise((resolve, reject) => {
      wss.on('listening', resolve)
      wss.on('error', reject)
    })
    return { wss, port }
  } catch (err) {
    if (err.code !== 'EADDRINUSE') throw err
    return { wss: null, port: null }
  }
}

/**
 * MCP tool definitions exposed by the channel plugin.
 */
/** Marker text for channel connectivity test. Background script auto-replies with 'pong'. */
export const CHANNEL_TEST_MARKER = 'ping'

export const TOOL_DEFINITIONS = [
  {
    name: 'ping',
    description: 'Test connectivity: CC → WebSocket → browser → WebSocket → CC. Returns { forward: bool, reverse: bool }.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
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
    name: 'evalInBrowser',
    description: [
      'Execute JavaScript in Firefox browser. Code runs in extension background with async browser API.',
      'Multi-page workflows supported (survives navigation).',
      'navigate() automatically opens a new tab for agent work (preserves user\'s active tab).',
      'Subsequent operations target this managed tab. closeTab() without args closes it;',
      'next navigate() creates a fresh tab.',
      '',
      'Usage: write JS code using `api` object. All functions are methods of `api` — call as `api.method()` or destructure first: `const {method} = api`.',
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
      'await api.navigate("https://example.com/login");',
      'await api.fill("#email", "user@test.com");',
      'await api.click("button[type=submit]");',
      'return await api.snapshot();',
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
