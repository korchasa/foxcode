import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLaunchHandler } from './tool.mjs'

function fakeChild() {
  return { pid: 99999, kill: () => {} }
}

function makeDeps(overrides = {}, ctx = {}) {
  ctx.projectDir = ctx.projectDir ?? mkdtempSync(join(tmpdir(), 'foxcode-proj-'))
  ctx.home = ctx.home ?? mkdtempSync(join(tmpdir(), 'foxcode-home-'))
  ctx.spawnCalls = []
  ctx.connectResolvers = []
  ctx.pidWritten = []

  const deps = {
    hasClients: () => ctx.hasClients ?? false,
    projectDir: () => ctx.projectDir,
    port: () => ctx.port ?? 8795,
    password: () => 'secret',
    prepare: () => ({ purged: [], killed: [] }),
    findExtensionDir: () => '/fake/ext',
    findFirefox: () => '/fake/firefox',
    spawn: (opts) => {
      ctx.spawnCalls.push(opts)
      const c = fakeChild()
      return { child: c, pid: c.pid }
    },
    handleExisting: async () => ({ action: 'spawn' }),
    ownerPid: () => ctx.ownerPid ?? process.pid,
    writePidFile: (path, pid, port, ownerPid) => {
      ctx.pidWritten.push({ path, pid, port, ownerPid })
      mkdirSync(join(path, '..'), { recursive: true })
      writeFileSync(path, `${pid}\n${port}\n${ownerPid ?? ''}\n`)
    },
    waitForClient: () => new Promise((resolve) => {
      ctx.connectResolvers.push(resolve)
    }),
    home: ctx.home,
    ...overrides,
  }
  return { deps, ctx }
}

describe('createLaunchHandler', () => {
  let ctxs = []
  afterEach(() => {
    for (const ctx of ctxs) {
      if (ctx.projectDir) rmSync(ctx.projectDir, { recursive: true, force: true })
      if (ctx.home) rmSync(ctx.home, { recursive: true, force: true })
    }
    ctxs = []
  })

  it('returns already-connected when extension is already attached', async () => {
    const { deps, ctx } = makeDeps({ hasClients: () => true })
    ctxs.push(ctx)
    const h = createLaunchHandler(deps)
    const r = await h({})
    assert.deepEqual(r, { status: 'already-connected' })
    assert.equal(ctx.spawnCalls.length, 0)
  })

  it('blocks until waitForClient resolves and returns status=connected', async () => {
    const { deps, ctx } = makeDeps()
    ctxs.push(ctx)
    const h = createLaunchHandler(deps)
    const p = h({})
    // Resolve waitForClient asynchronously.
    setTimeout(() => ctx.connectResolvers.forEach((r) => r()), 50)
    const r = await p
    assert.equal(r.status, 'connected')
    assert.equal(r.port, 8795)
    assert.equal(ctx.spawnCalls.length, 1, 'spawn must run exactly once')
  })

  it('returns status=timeout when waitForClient never resolves', async () => {
    const { deps, ctx } = makeDeps()
    ctxs.push(ctx)
    const h = createLaunchHandler(deps)
    const r = await h({ timeout: 100 })
    assert.equal(r.status, 'timeout')
    assert.equal(r.port, 8795)
  })

  it('is idempotent — concurrent calls share the same in-flight promise', async () => {
    const { deps, ctx } = makeDeps()
    ctxs.push(ctx)
    const h = createLaunchHandler(deps)
    const a = h({})
    const b = h({})
    setTimeout(() => ctx.connectResolvers.forEach((r) => r()), 30)
    const [ra, rb] = await Promise.all([a, b])
    assert.equal(ra.status, 'connected')
    assert.equal(rb.status, 'connected')
    assert.equal(ctx.spawnCalls.length, 1, 'spawn must run exactly once across concurrent calls')
  })

  it('reuse verdict + own client connects → already-running, no spawn', async () => {
    const { deps, ctx } = makeDeps({
      handleExisting: async () => ({ action: 'reuse', pid: 7777, port: 8000 }),
    })
    ctxs.push(ctx)
    const pidFile = join(ctx.projectDir, '.foxcode', 'web-ext.pid')
    mkdirSync(join(pidFile, '..'), { recursive: true })
    writeFileSync(pidFile, '7777\n8000\n4242\n')
    const h = createLaunchHandler(deps)
    const p = h({})
    // The browser (owned by another session) discovers our port and connects.
    setTimeout(() => ctx.connectResolvers.forEach((r) => r()), 30)
    const r = await p
    assert.equal(r.status, 'already-running')
    assert.equal(r.pid, 7777)
    assert.equal(ctx.spawnCalls.length, 0, 'must NOT spawn — an existing browser is reused')
  })

  it('reuse verdict + no connect within timeout → timeout', async () => {
    const { deps, ctx } = makeDeps({
      handleExisting: async () => ({ action: 'reuse', pid: 7777, port: 8000 }),
    })
    ctxs.push(ctx)
    const pidFile = join(ctx.projectDir, '.foxcode', 'web-ext.pid')
    mkdirSync(join(pidFile, '..'), { recursive: true })
    writeFileSync(pidFile, '7777\n8000\n4242\n')
    const h = createLaunchHandler(deps)
    const r = await h({ timeout: 80 })
    assert.equal(r.status, 'timeout')
    assert.equal(ctx.spawnCalls.length, 0)
  })

  it('spawn verdict (e.g. after orphan reap) → spawns and becomes owner', async () => {
    // handleExisting having reaped an orphan returns {action:'spawn'}; the
    // handler must proceed to spawn a fresh browser.
    const { deps, ctx } = makeDeps({
      handleExisting: async () => ({ action: 'spawn' }),
    })
    ctxs.push(ctx)
    const pidFile = join(ctx.projectDir, '.foxcode', 'web-ext.pid')
    mkdirSync(join(pidFile, '..'), { recursive: true })
    writeFileSync(pidFile, '7777\n8000\n4242\n')
    const h = createLaunchHandler(deps)
    const p = h({})
    setTimeout(() => ctx.connectResolvers.forEach((r) => r()), 30)
    const r = await p
    assert.equal(r.status, 'connected')
    assert.equal(ctx.spawnCalls.length, 1)
    assert.equal(ctx.pidWritten[0].ownerPid, process.pid, 'pid file records the owner pid')
  })

  it('stale launch.lock (dead holder) → proceeds to spawn (F6)', async () => {
    const { deps, ctx } = makeDeps()
    ctxs.push(ctx)
    const lock = join(ctx.projectDir, '.foxcode', 'launch.lock')
    mkdirSync(join(lock, '..'), { recursive: true })
    writeFileSync(lock, '2147483647') // dead holder pid
    const h = createLaunchHandler(deps)
    const p = h({})
    setTimeout(() => ctx.connectResolvers.forEach((r) => r()), 30)
    const r = await p
    assert.equal(r.status, 'connected')
    assert.equal(ctx.spawnCalls.length, 1, 'stale lock must not deadlock the launch')
  })

  it('live launch.lock holder → loser does not spawn, connects via discovery', async () => {
    const { deps, ctx } = makeDeps()
    ctxs.push(ctx)
    const lock = join(ctx.projectDir, '.foxcode', 'launch.lock')
    mkdirSync(join(lock, '..'), { recursive: true })
    writeFileSync(lock, String(process.pid)) // live holder (another session spawning)
    const h = createLaunchHandler(deps)
    const p = h({})
    setTimeout(() => ctx.connectResolvers.forEach((r) => r()), 30)
    const r = await p
    assert.equal(ctx.spawnCalls.length, 0, 'loser must not double-spawn while a live holder spawns')
    assert.equal(r.status, 'already-running')
  })

  it('returns error when Firefox binary cannot be found', async () => {
    const { deps, ctx } = makeDeps({ findFirefox: () => null })
    ctxs.push(ctx)
    const h = createLaunchHandler(deps)
    const r = await h({})
    assert.equal(r.status, 'error')
    assert.match(r.reason, /Firefox/)
    assert.equal(ctx.spawnCalls.length, 0)
  })

  it('writes PID file with current port after spawn', async () => {
    const { deps, ctx } = makeDeps()
    ctxs.push(ctx)
    const h = createLaunchHandler(deps)
    const p = h({})
    setTimeout(() => ctx.connectResolvers.forEach((r) => r()), 30)
    await p
    assert.equal(ctx.pidWritten.length, 1)
    assert.equal(ctx.pidWritten[0].pid, 99999)
    assert.equal(ctx.pidWritten[0].port, 8795)
    assert.ok(ctx.pidWritten[0].path.endsWith('web-ext.pid'))
  })
})
