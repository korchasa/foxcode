import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { PassThrough } from 'node:stream'
import {
  buildWebExtArgs,
  readPidFile,
  writePidFile,
  isProcessAlive,
  killProcessGroup,
  handleExistingProcess,
  spawnWebExt,
} from './spawn.mjs'

describe('buildWebExtArgs', () => {
  it('returns the canonical web-ext run argv', () => {
    const args = buildWebExtArgs({
      extensionDir: '/ext',
      firefoxBinary: '/ff',
      profileDir: '.foxcode/firefox-profile',
      port: 8795,
      password: 'secret',
    })
    assert.deepEqual(args.slice(0, 3), ['web-ext', 'run', '--source-dir'])
    assert.equal(args[3], '/ext')
    assert.ok(args.includes('--firefox-profile'))
    assert.ok(args.includes('.foxcode/firefox-profile'))
    assert.ok(args.includes('--keep-profile-changes'))
    assert.ok(args.includes('--firefox=/ff'))
    assert.ok(args.includes('--pref=app.update.enabled=false'))
    assert.ok(args.includes('--pref=app.update.staging.enabled=false'))
    assert.ok(args.includes('--start-url'))
    const i = args.indexOf('--start-url')
    assert.equal(args[i + 1], 'http://localhost:8795#8795:secret')
  })

  it('omits --start-url when credentials missing', () => {
    const args = buildWebExtArgs({ extensionDir: '/x', firefoxBinary: '/ff', profileDir: 'p' })
    assert.equal(args.includes('--start-url'), false)
  })

  it('appends --args=--headless when headless=true', () => {
    const args = buildWebExtArgs({ extensionDir: '/x', firefoxBinary: '/ff', profileDir: 'p', headless: true })
    assert.ok(args.includes('--args=--headless'))
  })

  it('rejects mismatched credentials (port without password)', () => {
    assert.throws(() => buildWebExtArgs({
      extensionDir: '/x', firefoxBinary: '/ff', profileDir: 'p', port: 8795,
    }), /port.*password/i)
  })
})

describe('PID file', () => {
  let tmp
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'foxcode-pid-')) })
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }) })

  it('write + read round-trip carries pid, port and ownerPid (3-line)', () => {
    const p = join(tmp, 'web-ext.pid')
    writePidFile(p, 12345, 8795, 999)
    assert.deepEqual(readPidFile(p), { pid: 12345, port: 8795, ownerPid: 999 })
  })

  it('legacy 2-line file (no ownerPid) reads ownerPid=null', () => {
    const p = join(tmp, 'web-ext.pid')
    writePidFile(p, 12345, 8795)
    assert.deepEqual(readPidFile(p), { pid: 12345, port: 8795, ownerPid: null })
  })

  it('write without port leaves port=null and ownerPid=null', () => {
    const p = join(tmp, 'web-ext.pid')
    writePidFile(p, 99, null)
    assert.deepEqual(readPidFile(p), { pid: 99, port: null, ownerPid: null })
  })

  it('read returns null for missing or malformed file', () => {
    assert.equal(readPidFile(join(tmp, 'nope')), null)
    writeFileSync(join(tmp, 'bad'), 'not-a-number\n')
    assert.equal(readPidFile(join(tmp, 'bad')), null)
  })
})

describe('isProcessAlive', () => {
  it('returns true for the current process', () => {
    assert.equal(isProcessAlive(process.pid), true)
  })

  it('returns false for an obviously dead PID', () => {
    // PID 1 is init/launchd; safer to use a large random PID unlikely to exist.
    assert.equal(isProcessAlive(2_147_483_647), false)
  })
})

describe('killProcessGroup', () => {
  it('SIGTERMs the process group then resolves once the leader exits', async () => {
    if (process.platform === 'win32') return
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
    await new Promise((r) => setTimeout(r, 50))
    const pid = child.pid
    await killProcessGroup(pid, { graceMs: 1000 })
    assert.equal(isProcessAlive(pid), false, 'process should be gone after killProcessGroup')
  })
})

describe('spawnWebExt stdio', () => {
  it('never inherits the parent stdout (would corrupt MCP JSON-RPC framing)', () => {
    let captured
    const fakeSpawn = (_cmd, _argv, opts) => {
      captured = opts
      return { stdout: null, stderr: null, pid: 1, unref() {} }
    }
    spawnWebExt({
      extensionDir: '/ext',
      firefoxBinary: '/ff',
      profileDir: '/p',
      port: 8795,
      password: 'pw',
    }, fakeSpawn)
    assert.ok(Array.isArray(captured.stdio), 'stdio must be explicit array')
    assert.equal(captured.stdio[0], 'ignore', 'stdin must be ignored')
    assert.notEqual(captured.stdio[1], 'inherit',
      'child stdout MUST NOT inherit parent fd 1 (MCP transport)')
  })

  it('pipes child stdout and forwards it to parent stderr', () => {
    const child = { stdout: new PassThrough(), pid: 1, unref() {} }
    const fakeSpawn = () => child
    const originalWrite = process.stderr.write.bind(process.stderr)
    let forwarded = ''
    process.stderr.write = (chunk) => { forwarded += String(chunk); return true }
    try {
      spawnWebExt({
        extensionDir: '/ext', firefoxBinary: '/ff', profileDir: '/p',
        port: 8795, password: 'pw',
      }, fakeSpawn)
      child.stdout.write('Running web extension from /tmp\n')
      child.stdout.end()
    } finally {
      process.stderr.write = originalWrite
    }
    assert.match(forwarded, /Running web extension/)
  })
})

describe('handleExistingProcess', () => {
  let tmp
  const DEAD_PID = 2_147_483_647
  const delay = (ms) => new Promise((r) => setTimeout(r, ms))
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'foxcode-handle-')) })
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }) })

  it('verdict spawn when no PID file exists', async () => {
    assert.deepEqual(await handleExistingProcess(join(tmp, 'nope')), { action: 'spawn' })
  })

  it('clears stale PID file (browser dead) → verdict spawn (F3)', async () => {
    const p = join(tmp, 'pid')
    writePidFile(p, DEAD_PID, 8795, process.pid)
    assert.deepEqual(await handleExistingProcess(p), { action: 'spawn' })
    assert.equal(existsSync(p), false)
  })

  it('verdict reuse when browser + owner are both alive (same port)', async () => {
    const p = join(tmp, 'pid')
    writePidFile(p, process.pid, 8795, process.pid)
    assert.deepEqual(await handleExistingProcess(p), { action: 'reuse', pid: process.pid, port: 8795 })
    assert.equal(existsSync(p), true, 'pid file kept for reuse')
  })

  it('verdict reuse for a live browser on a DIFFERENT port — NEVER kills it (multi-session)', async () => {
    if (process.platform === 'win32') return
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
    await delay(50)
    const p = join(tmp, 'pid')
    // browser alive on a different port; owner (this process) alive.
    writePidFile(p, child.pid, 8000, process.pid)
    const v = await handleExistingProcess(p)
    assert.deepEqual(v, { action: 'reuse', pid: child.pid, port: 8000 })
    assert.equal(isProcessAlive(child.pid), true, 'a healthy browser must NOT be killed on port mismatch')
    assert.equal(existsSync(p), true, 'pid file kept for reuse')
    await killProcessGroup(child.pid)
  })

  it('verdict reuse for a legacy 2-line pid file (ownerPid null) when browser alive', async () => {
    const p = join(tmp, 'pid')
    writePidFile(p, process.pid, 8795)
    assert.deepEqual(await handleExistingProcess(p), { action: 'reuse', pid: process.pid, port: 8795 })
  })

  it('reaps an orphan (browser alive, owner dead) → kills group, verdict spawn (F2)', async () => {
    if (process.platform === 'win32') return
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
    await delay(50)
    const p = join(tmp, 'pid')
    // browser alive, owner DEAD → confirmed orphan.
    writePidFile(p, child.pid, 8795, DEAD_PID)
    const v = await handleExistingProcess(p)
    assert.deepEqual(v, { action: 'spawn' })
    assert.equal(existsSync(p), false, 'orphan pid file cleared after reap')
    await delay(200)
    assert.equal(isProcessAlive(child.pid), false, 'orphaned browser group reaped')
  })
})
