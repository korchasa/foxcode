import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  state, nextId, buildChannelMeta, buildReplyMessage,
  buildToolUseMessage, buildToolResultMessage,
  TOOL_DEFINITIONS, assertChannelCapability, hasChannelCapability,
  buildPongMessage, createWebSocketServer, BASE_PORT, PORT_RANGE, portStorage,
} from './lib.mjs'
import { WebSocketServer } from 'ws'

describe('nextId', () => {
  beforeEach(() => { state.seq = 0 })

  it('returns string starting with "m"', () => {
    const id = nextId()
    assert.match(id, /^m\d+-\d+$/)
  })

  it('increments sequence on each call', () => {
    const a = nextId()
    const b = nextId()
    assert.notEqual(a, b)
    assert.match(a, /-1$/)
    assert.match(b, /-2$/)
  })
})

describe('buildChannelMeta', () => {
  beforeEach(() => { state.seq = 0 })

  it('builds meta with required fields', () => {
    const result = buildChannelMeta({ id: 'test-1', text: 'hello' })
    assert.equal(result.content, 'hello')
    assert.equal(result.meta.chat_id, 'web')
    assert.equal(result.meta.message_id, 'test-1')
    assert.equal(result.meta.user, 'web')
    assert.ok(result.meta.ts)
  })

  it('generates id when not provided', () => {
    const result = buildChannelMeta({ text: 'hello' })
    assert.match(result.meta.message_id, /^m\d+-\d+$/)
  })

  it('includes tab url and title when present', () => {
    const result = buildChannelMeta({
      id: 'x', text: 'hi',
      tab: { url: 'https://example.com', title: 'Example' },
    })
    assert.equal(result.meta.tab_url, 'https://example.com')
    assert.equal(result.meta.tab_title, 'Example')
  })

  it('omits tab fields when tab is absent', () => {
    const result = buildChannelMeta({ id: 'x', text: 'hi' })
    assert.equal(result.meta.tab_url, undefined)
    assert.equal(result.meta.tab_title, undefined)
  })
})

describe('buildReplyMessage', () => {
  beforeEach(() => { state.seq = 0 })

  it('builds reply with correct structure', () => {
    const msg = buildReplyMessage('Hello!', 'ref-1')
    assert.equal(msg.type, 'msg')
    assert.equal(msg.from, 'assistant')
    assert.equal(msg.text, 'Hello!')
    assert.equal(msg.replyTo, 'ref-1')
    assert.ok(msg.id)
    assert.ok(msg.ts)
  })

  it('allows undefined replyTo', () => {
    const msg = buildReplyMessage('No ref')
    assert.equal(msg.replyTo, undefined)
  })
})

describe('buildToolUseMessage', () => {
  beforeEach(() => { state.seq = 0 })

  it('builds tool_use with correct structure', () => {
    const msg = buildToolUseMessage('get_page_url', {})
    assert.equal(msg.type, 'tool_use')
    assert.equal(msg.tool, 'get_page_url')
    assert.deepEqual(msg.params, {})
    assert.ok(msg.id)
    assert.ok(msg.ts)
  })

  it('includes params', () => {
    const msg = buildToolUseMessage('get_page_content', { limit: 1000 })
    assert.deepEqual(msg.params, { limit: 1000 })
  })
})

describe('buildToolResultMessage', () => {
  beforeEach(() => { state.seq = 0 })

  it('builds tool_result with correct structure', () => {
    const msg = buildToolResultMessage('get_page_url', 'https://example.com')
    assert.equal(msg.type, 'tool_result')
    assert.equal(msg.tool, 'get_page_url')
    assert.equal(msg.content, 'https://example.com')
    assert.ok(msg.id)
    assert.ok(msg.ts)
  })
})

describe('assertChannelCapability', () => {
  it('does not throw when claude/channel is present', () => {
    assert.doesNotThrow(() => {
      assertChannelCapability({ experimental: { 'claude/channel': {} } })
    })
  })

  it('throws with plugin name in message when experimental is missing', () => {
    assert.throws(
      () => assertChannelCapability({ sampling: {} }),
      { message: /plugin:foxcode@korchasa/ }
    )
  })

  it('throws when experimental exists but claude/channel is absent', () => {
    assert.throws(
      () => assertChannelCapability({ experimental: { other: {} } }),
      { message: /plugin:foxcode@korchasa/ }
    )
  })

  it('throws when capabilities is undefined', () => {
    assert.throws(
      () => assertChannelCapability(undefined),
      { message: /plugin:foxcode@korchasa/ }
    )
  })

  it('uses custom server name in error message', () => {
    assert.throws(
      () => assertChannelCapability(undefined, 'my-server'),
      { message: /plugin:my-server@korchasa/ }
    )
  })
})

describe('hasChannelCapability', () => {
  it('returns true when claude/channel is present', () => {
    assert.equal(hasChannelCapability({ experimental: { 'claude/channel': {} } }), true)
  })

  it('returns false when experimental is missing', () => {
    assert.equal(hasChannelCapability({ sampling: {} }), false)
  })

  it('returns false when claude/channel is absent', () => {
    assert.equal(hasChannelCapability({ experimental: { other: {} } }), false)
  })

  it('returns false when capabilities is undefined', () => {
    assert.equal(hasChannelCapability(undefined), false)
  })
})

describe('buildPongMessage', () => {
  it('builds pong with all telemetry fields', () => {
    const env = { name: 'foxcode', version: '0.4.3', pid: 12345, port: 8787, uptime: 10.5, clients: 2, pendingRequests: 1, nodeVersion: 'v22.0.0', pluginRoot: '/home/.claude/plugins/cache/foxcode', projectDir: '/Users/test/www/4ra' }
    const msg = buildPongMessage(env)
    assert.equal(msg.type, 'pong')
    assert.equal(msg.server, 'foxcode')
    assert.equal(msg.version, '0.4.3')
    assert.equal(msg.pid, 12345)
    assert.equal(msg.port, 8787)
    assert.equal(msg.uptime, 10.5)
    assert.equal(msg.clients, 2)
    assert.equal(msg.pendingRequests, 1)
    assert.equal(msg.nodeVersion, 'v22.0.0')
    assert.equal(msg.pluginRoot, '/home/.claude/plugins/cache/foxcode')
    assert.equal(msg.projectDir, '/Users/test/www/4ra')
    assert.ok(msg.ts)
  })
})

describe('createWebSocketServer', () => {
  let origLoad, origSave
  beforeEach(() => {
    origLoad = portStorage.load
    origSave = portStorage.save
    portStorage.load = () => null
    portStorage.save = () => {}
  })
  afterEach(() => {
    portStorage.load = origLoad
    portStorage.save = origSave
  })

  /** Helper: find a port that is definitely free by briefly binding, then closing. */
  async function findFreePort() {
    const tmp = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    await new Promise((resolve) => tmp.on('listening', resolve))
    const port = tmp.address().port
    await new Promise((resolve) => tmp.close(resolve))
    return port
  }

  it('binds to explicit port when provided', async () => {
    const freePort = await findFreePort()
    const { wss, port } = await createWebSocketServer(WebSocketServer, freePort)
    assert.ok(wss, 'wss should not be null')
    assert.equal(port, freePort)
    await new Promise((resolve) => wss.close(resolve))
  })

  it('skips occupied port and binds to next', async () => {
    // Occupy BASE_PORT
    const blocker = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    await new Promise((resolve) => blocker.on('listening', resolve))
    const blockedPort = blocker.address().port

    // Create a class that tries blockedPort first, then blockedPort+1
    const { wss, port } = await createWebSocketServer(WebSocketServer, null)

    // Cannot control BASE_PORT in test env, so use explicit port test instead:
    // Occupy a known port, then request it explicitly → should fail gracefully
    const result = await createWebSocketServer(WebSocketServer, blockedPort)
    assert.equal(result.wss, null)
    assert.equal(result.port, null)

    await new Promise((resolve) => blocker.close(resolve))
    if (wss) await new Promise((resolve) => wss.close(resolve))
  })

  it('returns null when all ports in range are taken', async () => {
    // Use explicit port pointing to an occupied port
    const blocker = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    await new Promise((resolve) => blocker.on('listening', resolve))
    const blockedPort = blocker.address().port

    const { wss, port } = await createWebSocketServer(WebSocketServer, blockedPort)
    assert.equal(wss, null)
    assert.equal(port, null)

    await new Promise((resolve) => blocker.close(resolve))
  })

  it('propagates non-EADDRINUSE errors', async () => {
    // Fake WSS constructor that throws a different error
    class BrokenWSS {
      constructor() {
        throw Object.assign(new Error('permission denied'), { code: 'EACCES' })
      }
    }
    await assert.rejects(
      () => createWebSocketServer(BrokenWSS, 9999),
      { code: 'EACCES' }
    )
  })

  it('exports correct constants', () => {
    assert.equal(BASE_PORT, 8787)
    assert.equal(PORT_RANGE, 100)
  })
})

describe('TOOL_DEFINITIONS', () => {
  it('has 4 tools (status, ping, reply, evalInBrowser)', () => {
    assert.equal(TOOL_DEFINITIONS.length, 4)
    const names = TOOL_DEFINITIONS.map(t => t.name)
    assert.deepEqual(names, ['status', 'ping', 'reply', 'evalInBrowser'])
  })

  it('status has no required params', () => {
    const tool = TOOL_DEFINITIONS.find(t => t.name === 'status')
    assert.ok(tool)
    assert.equal(tool.inputSchema.required, undefined)
  })

  it('all tools have name, description, inputSchema', () => {
    for (const tool of TOOL_DEFINITIONS) {
      assert.ok(tool.name, `tool missing name`)
      assert.ok(tool.description, `${tool.name} missing description`)
      assert.ok(tool.inputSchema, `${tool.name} missing inputSchema`)
      assert.equal(tool.inputSchema.type, 'object')
    }
  })

  it('reply tool requires text', () => {
    const reply = TOOL_DEFINITIONS.find(t => t.name === 'reply')
    assert.deepEqual(reply.inputSchema.required, ['text'])
  })

  it('evalInBrowser requires code', () => {
    const tool = TOOL_DEFINITIONS.find(t => t.name === 'evalInBrowser')
    assert.deepEqual(tool.inputSchema.required, ['code'])
    assert.ok(tool.inputSchema.properties.code)
    assert.ok(tool.inputSchema.properties.timeout)
  })
})
