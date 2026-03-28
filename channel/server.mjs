#!/usr/bin/env node
/**
 * FoxCode — Channel plugin for Firefox extension.
 *
 * MCP server that bridges Claude Code ↔ Firefox extension via WebSocket.
 * - Declares claude/channel capability for bidirectional messaging
 * - Exposes reply/edit_message tools for CC → browser responses
 * - Exposes evalInBrowser tool for CC → browser automation (JS execution with ~30 API helpers)
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
  nextId, buildChannelMeta, buildReplyMessage, buildEditMessage,
  buildToolUseMessage, buildToolResultMessage, TOOL_DEFINITIONS,
} from './lib.mjs'
import { validateCode } from './validator.mjs'

const PORT = Number(process.env.FOXCODE_PORT ?? 8787)

// --- WebSocket server for extension connection ---

const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT })
const clients = new Set()

/** Pending browser tool requests: request_id → {resolve, reject, timer} */
const pendingToolRequests = new Map()
const TOOL_TIMEOUT_MS = 30_000

function broadcast(msg) {
  const data = JSON.stringify(msg)
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(data)
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

wss.on('connection', (ws) => {
  clients.add(ws)
  ws.on('close', () => clients.delete(ws))
  ws.on('error', () => clients.delete(ws))
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw))
      handleExtensionMessage(msg)
    } catch { /* ignore malformed messages */ }
  })
})

function handleExtensionMessage(msg) {
  process.stderr.write(`foxcode: rx ${msg.type} ${JSON.stringify(msg).slice(0, 200)}\n`)
  switch (msg.type) {
    case 'message': {
      // FR-2: User message from browser → forward to CC via channel notification
      const { content, meta } = buildChannelMeta(msg)
      process.stderr.write(`foxcode: notify channel content=${content.slice(0, 100)}\n`)
      mcp.notification({
        method: 'notifications/claude/channel',
        params: { content, meta },
      })
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
  { name: 'foxcode', version: '0.1.0' },
  {
    capabilities: {
      tools: {},
      experimental: { 'claude/channel': {} },
    },
    instructions: [
      'Messages from the Firefox browser arrive as <channel source="foxcode" chat_id="web" message_id="..." tab_url="..." tab_title="...">.',
      'The tab_url and tab_title attributes show which page the user is currently viewing.',
      'The browser user reads the Firefox sidebar, not this terminal. Anything you want them to see MUST go through the reply tool — your transcript output never reaches the browser UI.',
      'Use evalInBrowser tool to execute JS in browser with full browser automation API (click, fill, navigate, snapshot, etc.).',
      `Browser extension connects to ws://localhost:${PORT}.`,
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
      case 'reply': {
        const replyMsg = buildReplyMessage(args.text, args.reply_to)
        broadcast(replyMsg)
        return { content: [{ type: 'text', text: `sent (${replyMsg.id})` }] }
      }
      case 'edit_message': {
        broadcast(buildEditMessage(args.message_id, args.text))
        return { content: [{ type: 'text', text: 'ok' }] }
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

// --- Start ---

await mcp.connect(new StdioServerTransport())
process.stderr.write(`foxcode: ws://localhost:${PORT}\n`)
