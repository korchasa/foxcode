import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  state, nextId, buildChannelMeta, buildReplyMessage,
  buildEditMessage, buildToolUseMessage, buildToolResultMessage,
  TOOL_DEFINITIONS, assertChannelCapability,
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

describe('buildEditMessage', () => {
  it('builds edit with correct structure', () => {
    const msg = buildEditMessage('msg-1', 'updated text')
    assert.deepEqual(msg, { type: 'edit', id: 'msg-1', text: 'updated text' })
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

  it('throws with server name in message when experimental is missing', () => {
    assert.throws(
      () => assertChannelCapability({ sampling: {} }),
      { message: /server:foxcode/ }
    )
  })

  it('throws when experimental exists but claude/channel is absent', () => {
    assert.throws(
      () => assertChannelCapability({ experimental: { other: {} } }),
      { message: /server:foxcode/ }
    )
  })

  it('throws when capabilities is undefined', () => {
    assert.throws(
      () => assertChannelCapability(undefined),
      { message: /server:foxcode/ }
    )
  })

  it('uses custom server name in error message', () => {
    assert.throws(
      () => assertChannelCapability(undefined, 'my-server'),
      { message: /server:my-server/ }
    )
  })
})

describe('TOOL_DEFINITIONS', () => {
  it('has 3 tools (reply, edit_message, evalInBrowser)', () => {
    assert.equal(TOOL_DEFINITIONS.length, 3)
    const names = TOOL_DEFINITIONS.map(t => t.name)
    assert.deepEqual(names, ['reply', 'edit_message', 'evalInBrowser'])
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

  it('edit_message tool requires message_id and text', () => {
    const edit = TOOL_DEFINITIONS.find(t => t.name === 'edit_message')
    assert.deepEqual(edit.inputSchema.required, ['message_id', 'text'])
  })

  it('evalInBrowser requires code', () => {
    const tool = TOOL_DEFINITIONS.find(t => t.name === 'evalInBrowser')
    assert.deepEqual(tool.inputSchema.required, ['code'])
    assert.ok(tool.inputSchema.properties.code)
    assert.ok(tool.inputSchema.properties.timeout)
  })
})
