import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  state, nextId,
  buildToolUseMessage, buildToolResultMessage,
  TOOL_DEFINITIONS,
  buildPongMessage, PROTOCOL_VERSION, createHttpServer, BASE_PORT, PORT_RANGE, portStorage,
  passwordStorage,
  getServerMeta,
  resolveProjectDir,
} from './lib.mjs'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'

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

describe('buildPongMessage', () => {
  it('builds pong with all telemetry fields', () => {
    const env = { name: 'foxcode', version: '0.4.3', pid: 12345, port: 8787, uptime: 10.5, clients: 2, pendingRequests: 1, nodeVersion: 'v22.0.0', pluginRoot: '/home/.claude/plugins/cache/foxcode', projectDir: '/Users/test/www/4ra' }
    const msg = buildPongMessage(env)
    assert.equal(msg.type, 'pong')
    assert.equal(msg.protocol_version, PROTOCOL_VERSION)
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

describe('portConstants', () => {
  it('exports correct constants', () => {
    assert.equal(BASE_PORT, 8787)
    assert.equal(PORT_RANGE, 100)
  })
})

describe('passwordStorage', () => {
  let origLoad, origSave
  beforeEach(() => {
    origLoad = passwordStorage.load
    origSave = passwordStorage.save
  })
  afterEach(() => {
    passwordStorage.load = origLoad
    passwordStorage.save = origSave
  })

  it('generate() returns 32-char hex string', () => {
    const pw = passwordStorage.generate()
    assert.equal(pw.length, 32)
    assert.match(pw, /^[0-9a-f]{32}$/)
  })

  it('generate() returns unique values', () => {
    const a = passwordStorage.generate()
    const b = passwordStorage.generate()
    assert.notEqual(a, b)
  })

  it('load() returns null when file does not exist', () => {
    passwordStorage.load = () => null
    assert.equal(passwordStorage.load(), null)
  })

  it('save/load round-trip works via mock', () => {
    let stored = null
    passwordStorage.save = (pw) => { stored = pw }
    passwordStorage.load = () => stored

    const pw = passwordStorage.generate()
    passwordStorage.save(pw)
    assert.equal(passwordStorage.load(), pw)
  })
})

describe('createHttpServer', () => {
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

  it('binds to explicit port', async () => {
    const tmp = createServer()
    await new Promise((resolve) => tmp.listen(0, '127.0.0.1', resolve))
    const freePort = tmp.address().port
    await new Promise((resolve) => tmp.close(resolve))

    const { httpServer, port } = await createHttpServer(freePort)
    assert.ok(httpServer, 'httpServer should not be null')
    assert.equal(port, freePort)
    await new Promise((resolve) => httpServer.close(resolve))
  })

  it('returns null for occupied port', async () => {
    const blocker = createServer()
    await new Promise((resolve) => blocker.listen(0, '127.0.0.1', resolve))
    const blockedPort = blocker.address().port

    const { httpServer, port } = await createHttpServer(blockedPort)
    assert.equal(httpServer, null)
    assert.equal(port, null)

    await new Promise((resolve) => blocker.close(resolve))
  })

  it('propagates non-EADDRINUSE errors', async () => {
    if (process.getuid && process.getuid() === 0) return
    await assert.rejects(
      () => createHttpServer(1),
      (err) => err.code === 'EACCES' || err.code === 'EADDRINUSE'
    )
  })
})

describe('TOOL_DEFINITIONS', () => {
  it('exposes status, launchBrowser, evalInBrowser', () => {
    assert.equal(TOOL_DEFINITIONS.length, 3)
    const names = TOOL_DEFINITIONS.map(t => t.name)
    assert.deepEqual(names, ['status', 'launchBrowser', 'evalInBrowser'])
  })

  it('launchBrowser exposes optional timeout and headless params', () => {
    const tool = TOOL_DEFINITIONS.find(t => t.name === 'launchBrowser')
    assert.ok(tool)
    assert.equal(tool.inputSchema.required, undefined)
    assert.ok(tool.inputSchema.properties.timeout)
    assert.ok(tool.inputSchema.properties.headless)
  })

  it('status has no required params', () => {
    const tool = TOOL_DEFINITIONS.find(t => t.name === 'status')
    assert.ok(tool)
    assert.equal(tool.inputSchema.required, undefined)
  })

  it('status description names extensionDir as a returned field', () => {
    const tool = TOOL_DEFINITIONS.find(t => t.name === 'status')
    assert.match(
      tool.description,
      /extensionDir/,
      'status TOOL_DEFINITIONS description must document extensionDir field',
    )
  })

  it('all tools have name, description, inputSchema', () => {
    for (const tool of TOOL_DEFINITIONS) {
      assert.ok(tool.name, `tool missing name`)
      assert.ok(tool.description, `${tool.name} missing description`)
      assert.ok(tool.inputSchema, `${tool.name} missing inputSchema`)
      assert.equal(tool.inputSchema.type, 'object')
    }
  })

  it('evalInBrowser requires code', () => {
    const tool = TOOL_DEFINITIONS.find(t => t.name === 'evalInBrowser')
    assert.deepEqual(tool.inputSchema.required, ['code'])
    assert.ok(tool.inputSchema.properties.code)
    assert.ok(tool.inputSchema.properties.timeout)
  })
})

describe('getServerMeta', () => {
  const ownPkg = JSON.parse(
    readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
  )

  it('returns name from channel package.json (not from plugin manifest)', () => {
    const meta = getServerMeta()
    assert.equal(meta.name, ownPkg.name)
  })

  it('returns version from channel package.json', () => {
    const meta = getServerMeta()
    assert.equal(meta.version, ownPkg.version)
  })

  it('lib.mjs does not depend on parent .claude-plugin/ directory', () => {
    const src = readFileSync(new URL('./lib.mjs', import.meta.url), 'utf8')
    assert.ok(
      !src.includes('.claude-plugin'),
      'lib.mjs must not reference ../.claude-plugin/',
    )
  })

  it('server.mjs sources name/version via getServerMeta (no plugin manifest require)', () => {
    const src = readFileSync(new URL('./server.mjs', import.meta.url), 'utf8')
    assert.ok(
      !src.includes('.claude-plugin'),
      'server.mjs must not reference ../.claude-plugin/',
    )
  })
})

describe('resolveProjectDir', () => {
  it('returns FOXCODE_PROJECT_DIR when set to a non-empty string', () => {
    assert.equal(resolveProjectDir({ FOXCODE_PROJECT_DIR: '/u/p' }), '/u/p')
  })

  it('falls back to process.cwd() when FOXCODE_PROJECT_DIR is unset', () => {
    assert.equal(resolveProjectDir({}), process.cwd())
  })

  it('falls back to process.cwd() when FOXCODE_PROJECT_DIR is an empty string', () => {
    assert.equal(resolveProjectDir({ FOXCODE_PROJECT_DIR: '' }), process.cwd())
  })

  it('defaults env arg to process.env', () => {
    const saved = process.env.FOXCODE_PROJECT_DIR
    try {
      process.env.FOXCODE_PROJECT_DIR = '/from/env'
      assert.equal(resolveProjectDir(), '/from/env')
    } finally {
      if (saved === undefined) delete process.env.FOXCODE_PROJECT_DIR
      else process.env.FOXCODE_PROJECT_DIR = saved
    }
  })

  it('server.mjs has no remaining inline FOXCODE_PROJECT_DIR || cwd fallbacks', () => {
    const src = readFileSync(new URL('./server.mjs', import.meta.url), 'utf8')
    const matches = src.match(/FOXCODE_PROJECT_DIR\s*\|\|\s*process\.cwd\(\)/g) || []
    assert.equal(matches.length, 0, 'use resolveProjectDir() instead of inline ||')
  })
})
