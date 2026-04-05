/**
 * FoxCode - Channel plugin shared logic.
 * Pure functions and protocol definitions, testable without MCP/WebSocket.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
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
 * Build a pong response with server telemetry.
 * @param {{name: string, version: string, pid: number, port: number, uptime: number, clients: number, pendingRequests: number, nodeVersion: string, pluginRoot: string|undefined, projectDir: string|undefined}} env
 * @returns {object}
 */
/** Protocol version for WebSocket message format compatibility checks. */
export const PROTOCOL_VERSION = 1

export function buildPongMessage(env) {
  return {
    type: 'pong',
    protocol_version: PROTOCOL_VERSION,
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

/** Default path to saved password file. */
export const PASSWORD_FILE = join(homedir(), '.foxcode', 'password')

/**
 * Password persistence storage. Replaceable for testing.
 */
export const passwordStorage = {
  generate() {
    return randomBytes(16).toString('hex')
  },
  load() {
    try {
      const raw = readFileSync(PASSWORD_FILE, 'utf8').trim()
      return raw.length > 0 ? raw : null
    } catch {
      return null
    }
  },
  save(pw) {
    mkdirSync(dirname(PASSWORD_FILE), { recursive: true, mode: 0o700 })
    writeFileSync(PASSWORD_FILE, pw, { encoding: 'utf8', mode: 0o600 })
  },
}

/**
 * Find an available port and bind an HTTP server to it.
 * Same port selection logic as createWebSocketServer but returns httpServer directly.
 * Avoids TOCTOU race of bind-close-rebind.
 * @param {number|null} explicitPort - If set, only try this port
 * @returns {Promise<{httpServer: import('http').Server|null, port: number|null}>}
 */
export async function createHttpServer(explicitPort = null) {
  if (explicitPort != null) {
    return tryBindHttpPort(explicitPort)
  }

  const saved = portStorage.load()
  const start = saved ?? (BASE_PORT + Math.floor(Math.random() * PORT_RANGE))
  const ports = []
  for (let i = 0; i < PORT_RANGE; i++) {
    ports.push(BASE_PORT + ((start - BASE_PORT + i) % PORT_RANGE))
  }

  for (const port of ports) {
    const result = await tryBindHttpPort(port)
    if (result.httpServer) {
      portStorage.save(port)
      return result
    }
  }
  return { httpServer: null, port: null }
}

async function tryBindHttpPort(port) {
  const { createServer: createHttpSrv } = await import('node:http')
  const server = createHttpSrv()
  try {
    await new Promise((resolve, reject) => {
      const onError = (err) => {
        server.removeListener('listening', onListening)
        reject(err)
      }
      const onListening = () => {
        server.removeListener('error', onError)
        resolve()
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(port, '127.0.0.1')
    })
    return { httpServer: server, port }
  } catch (err) {
    if (err.code !== 'EADDRINUSE') throw err
    return { httpServer: null, port: null }
  }
}

/** Escape HTML special characters to prevent XSS in generated pages. */
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Generate informational HTML page served at http://localhost:PORT.
 * No secrets. Polls /status every 2s for live connection state.
 * @param {number} port
 * @param {{projectDir?: string, version?: string}} meta
 * @returns {string}
 */
export function buildConnectionPage(port, meta = {}) {
  const project = escapeHtml(meta.projectDir ? meta.projectDir.split('/').pop() : 'unknown')
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>FoxCode — ${project}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
display:flex;align-items:center;justify-content:center;min-height:100vh;
background:#f5f5f5;color:#1a1a1a}
@media(prefers-color-scheme:dark){body{background:#1a1a1a;color:#e0e0e0}}
.card{text-align:center;padding:40px;max-width:400px}
h1{font-size:20px;margin-bottom:8px}
.meta{font-size:13px;color:#888;margin-bottom:16px;font-family:"SF Mono",Monaco,Menlo,monospace}
.status{font-size:14px;color:#888}
.hint{font-size:13px;color:#34a853;margin-top:12px;display:none}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;
background:#888;margin-right:6px;vertical-align:middle}
</style>
</head><body>
<div class="card">
<h1>FoxCode</h1>
<div class="meta">${project} · :${port} · v${escapeHtml(meta.version || '?')}</div>
<div class="status"><span class="dot" id="dot"></span><span id="status-text">Waiting for extension</span></div>
<div class="hint" id="hint">Extension connected. You can close this tab.</div>
</div>
<script>
(function(){
  var dot=document.getElementById('dot'),
      txt=document.getElementById('status-text'),
      hint=document.getElementById('hint');
  function poll(){
    fetch('/status').then(function(r){return r.json()}).then(function(d){
      var n=d.connectedClients;
      if(n>0){
        dot.style.background='#34a853';
        txt.textContent='Connected ('+n+' client'+(n>1?'s':'')+')';
        hint.style.display='block';
      }else{
        dot.style.background='#888';
        txt.textContent='Waiting for extension';
        hint.style.display='none';
      }
    }).catch(function(){});
  }
  poll();
  setInterval(poll,2000);
})();
</script>
</body></html>`
}

/**
 * MCP tool definitions exposed by the channel plugin.
 */
export const TOOL_DEFINITIONS = [
  {
    name: 'status',
    description: 'Get server status and telemetry. Always works, does not require browser connection. Returns port, password, projectDir, uptime, connectedClients, pendingRequests, nodeVersion, serverVersion.',
    inputSchema: {
      type: 'object',
      properties: {},
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
      'Usage: write JS code using `api` object. All functions are methods of `api` - call as `api.method()` or destructure first: `const {method} = api`.',
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
      '- Eval: api.eval(expr) - execute in page JS context (access page vars, React state)',
      '- Navigation: api.navigate(url), api.goBack(), api.goForward(), api.reload()',
      '  - all await page load',
      '- Tabs: api.getTabs(), api.newTab(url?), api.closeTab(idx?), api.selectTab(idx)',
      '  closeTab() without args closes managed tab; with idx closes by index',
      '- Storage: api.localStorage.{list,get,set,delete,clear}(),',
      '  api.sessionStorage.{…}()',
      '- Cookies: api.getCookies(filter?), api.setCookie(details),',
      '  api.deleteCookie(name,url)',
      '- Window: api.resize(w,h), api.screenshot() -> base64',
      '- Dialog: api.interceptDialog("accept"|"dismiss")',
      '- Console: api.captureConsole(), api.getConsoleLogs()',
      '',
      'opts = {timeout: ms} - override auto-wait timeout per call',
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
