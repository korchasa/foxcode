import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  state, nextId, buildChannelMeta, buildReplyMessage,
  buildToolUseMessage, buildToolResultMessage,
  TOOL_DEFINITIONS, assertChannelCapability, hasChannelCapability,
  buildPongMessage,
} from './lib.mjs'

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
    const env = { pid: 12345, port: 8787, uptime: 10.5, clients: 2, pendingRequests: 1, nodeVersion: 'v22.0.0', pluginRoot: '/home/.claude/plugins/cache/foxcode' }
    const msg = buildPongMessage(env)
    assert.equal(msg.type, 'pong')
    assert.equal(msg.server, 'foxcode')
    assert.equal(msg.version, '0.1.0')
    assert.equal(msg.pid, 12345)
    assert.equal(msg.port, 8787)
    assert.equal(msg.uptime, 10.5)
    assert.equal(msg.clients, 2)
    assert.equal(msg.pendingRequests, 1)
    assert.equal(msg.nodeVersion, 'v22.0.0')
    assert.equal(msg.pluginRoot, '/home/.claude/plugins/cache/foxcode')
    assert.ok(msg.ts)
    assert.equal(msg.channel, undefined)
    assert.equal(msg.channelHint, undefined)
  })
})

describe('TOOL_DEFINITIONS', () => {
  it('has 3 tools (ping, reply, evalInBrowser)', () => {
    assert.equal(TOOL_DEFINITIONS.length, 3)
    const names = TOOL_DEFINITIONS.map(t => t.name)
    assert.deepEqual(names, ['ping', 'reply', 'evalInBrowser'])
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
