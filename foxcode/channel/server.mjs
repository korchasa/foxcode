#!/usr/bin/env node
/**
 * FoxCode - Channel plugin for Firefox extension.
 *
 * MCP server that bridges Claude Code ↔ Firefox extension via WebSocket.
 * - Exposes evalInBrowser tool for CC -> browser automation (JS execution with ~30 API helpers)
 * - WebSocket server on localhost for extension connection
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { WebSocketServer } from 'ws'
import {
  nextId, buildToolUseMessage, buildToolResultMessage, TOOL_DEFINITIONS,
  buildPongMessage, createHttpServer, buildConnectionPage,
  passwordStorage,
} from './lib.mjs'
import { validateCode } from './validator.mjs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pluginMeta = require('../.claude-plugin/plugin.json')

const explicitPort = process.env.FOXCODE_PORT != null ? Number(process.env.FOXCODE_PORT) : null

// --- Password auth ---

const PASSWORD = passwordStorage.load() ?? (() => {
  const pw = passwordStorage.generate()
  passwordStorage.save(pw)
  return pw
})()

/** Last known client connection info from extension ping. */
let clientInfo = null

// --- WebSocket server with upgrade-level auth ---

const { httpServer, port: PORT } = await createHttpServer(explicitPort)
const wss = new WebSocketServer({ noServer: true })
const clients = new Set()

if (httpServer) {
  httpServer.on('request', (req, res) => {
    if (req.method !== 'GET' || req.url !== '/') {
      res.writeHead(404)
      res.end()
      return
    }
    const projectDir = process.env.FOXCODE_PROJECT_DIR || process.cwd()
    const html = buildConnectionPage(PORT, clients.size, { projectDir, version: pluginMeta.version })
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  })

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost')
    const token = url.searchParams.get('token')
    if (token !== PASSWORD) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  })
}

/** Pending browser tool requests: request_id -> {resolve, reject, timer} */
const pendingToolRequests = new Map()
const TOOL_TIMEOUT_MS = 30_000

function broadcast(msg) {
  const data = JSON.stringify(msg)
  for (const ws of clients) {
    if (ws.readyState === 1) {
      try {
        ws.send(data)
      } catch {
        clients.delete(ws)
      }
    }
  }
}

function hasClients() {
  for (const ws of clients) {
    if (ws.readyState === 1) return true
  }
  return false
}

/**
 * Send a tool request to the browser extension and wait for the response.
 * Returns a promise that resolves with the response content.
 */
function requestFromBrowser(tool, params = {}) {
  return new Promise((resolve, reject) => {
    if (!hasClients()) {
      reject(new Error('No browser extension connected'))
      return
    }
    const requestId = `req-${nextId()}`
    const timer = setTimeout(() => {
      pendingToolRequests.delete(requestId)
      reject(new Error(`Browser tool request timed out after ${TOOL_TIMEOUT_MS}ms`))
    }, TOOL_TIMEOUT_MS)

    pendingToolRequests.set(requestId, { resolve, reject, timer })
    broadcast({ type: 'tool_request', request_id: requestId, tool, params })
  })
}

if (httpServer) wss.on('connection', (ws) => {
  clients.add(ws)
  ws.on('close', () => {
    clients.delete(ws)
    if (clients.size === 0) clientInfo = null
    // Reject all pending tool requests from this disconnected client
    for (const [id, pending] of pendingToolRequests) {
      clearTimeout(pending.timer)
      pendingToolRequests.delete(id)
      pending.reject(new Error('Browser extension disconnected'))
    }
  })
  ws.on('error', () => clients.delete(ws))
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw))
      handleExtensionMessage(msg, ws)
    } catch { /* ignore malformed messages */ }
  })
})

function handleExtensionMessage(msg, ws) {
  process.stderr.write(`foxcode: rx ${msg.type} ${JSON.stringify(msg).slice(0, 200)}\n`)
  switch (msg.type) {
    case 'ping': {
      clientInfo = {
        paramsSource: msg.paramsSource || null,
        connectedAt: new Date().toISOString(),
      }
      const pong = buildPongMessage({
        name: pluginMeta.name,
        version: pluginMeta.version,
        pid: process.pid,
        port: PORT,
        uptime: process.uptime(),
        clients: clients.size,
        pendingRequests: pendingToolRequests.size,
        nodeVersion: process.version,
        pluginRoot: process.env.CLAUDE_PLUGIN_ROOT,
        projectDir: process.env.FOXCODE_PROJECT_DIR || process.cwd(),
      })
      if (ws.readyState === 1) ws.send(JSON.stringify(pong))
      break
    }
    case 'tool_response': {
      // FR-5: Browser responding to a tool request from CC
      const pending = pendingToolRequests.get(msg.request_id)
      if (pending) {
        clearTimeout(pending.timer)
        pendingToolRequests.delete(msg.request_id)
        pending.resolve(msg.content)
      }
      break
    }
  }
}

// --- MCP server ---

const mcp = new Server(
  { name: pluginMeta.name, version: pluginMeta.version },
  {
    capabilities: {
      tools: {},
    },
    instructions: [
      'Use evalInBrowser tool to execute JS in browser with full browser automation API (click, fill, navigate, snapshot, etc.).',
      PORT ? `Browser extension connects to ws://localhost:${PORT}.` : 'No WebSocket port available - browser extension cannot connect.',
    ].join('\n'),
  },
)

// --- MCP Tools ---

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_DEFINITIONS,
}))

mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  const args = (req.params.arguments ?? {})
  try {
    switch (req.params.name) {
      case 'status': {
        const status = {
          port: PORT,
          password: PASSWORD,
          projectDir: process.env.FOXCODE_PROJECT_DIR || process.cwd(),
          uptime: process.uptime(),
          connectedClients: clients.size,
          pendingRequests: pendingToolRequests.size,
          nodeVersion: process.version,
          serverVersion: pluginMeta.version,
          pid: process.pid,
          pluginRoot: process.env.CLAUDE_PLUGIN_ROOT || null,
          launchMode: process.env.CLAUDE_PLUGIN_ROOT ? 'plugin' : 'dev',
          client: clientInfo,
        }
        return { content: [{ type: 'text', text: JSON.stringify(status) }] }
      }
      case 'ping': {
        const connected = hasClients()
        const result = { connected }
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      }
      case 'evalInBrowser': {
        const { valid, error } = validateCode(args.code)
        if (!valid) {
          return { content: [{ type: 'text', text: `Syntax error: ${error}` }], isError: true }
        }
        const timeout = args.timeout ?? 30000
        broadcast(buildToolUseMessage('evalInBrowser', { code: args.code }))
        const result = await requestFromBrowser('EVAL_CODE', { code: args.code, timeout })
        const text = typeof result === 'string' ? result : JSON.stringify(result)
        broadcast(buildToolResultMessage('evalInBrowser', text))
        return { content: [{ type: 'text', text }] }
      }
      default:
        return { content: [{ type: 'text', text: `unknown tool: ${req.params.name}` }], isError: true }
    }
  } catch (err) {
    return { content: [{ type: 'text', text: `${req.params.name}: ${err.message}` }], isError: true }
  }
})

// --- Graceful shutdown ---

function shutdown(reason) {
  process.stderr.write(`foxcode: shutdown (${reason})\n`)
  for (const ws of clients) ws.terminate()
  if (httpServer) wss.close()
  if (httpServer) httpServer.close()
  process.exit(0)
}

process.stdin.on('end', () => shutdown('stdin closed'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// --- Start ---

mcp.oninitialized = () => {
  process.stderr.write('foxcode: initialized\n')
}

await mcp.connect(new StdioServerTransport())
if (PORT) {
  process.stderr.write(`foxcode: ws://localhost:${PORT}\n`)
} else {
  process.stderr.write('foxcode: no free port in range, running without WebSocket\n')
}
