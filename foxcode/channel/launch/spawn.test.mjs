import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import {
  buildWebExtArgs,
  readPidFile,
  writePidFile,
  isProcessAlive,
  killProcessGroup,
  handleExistingProcess,
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

  it('write + read round-trip carries pid and port', () => {
    const p = join(tmp, 'web-ext.pid')
    writePidFile(p, 12345, 8795)
    const info = readPidFile(p)
    assert.deepEqual(info, { pid: 12345, port: 8795 })
  })

  it('write without port leaves port=null', () => {
    const p = join(tmp, 'web-ext.pid')
    writePidFile(p, 99, null)
    assert.deepEqual(readPidFile(p), { pid: 99, port: null })
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

describe('handleExistingProcess', () => {
  let tmp
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'foxcode-handle-')) })
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }) })

  it('returns null when no PID file exists', () => {
    assert.equal(handleExistingProcess(join(tmp, 'nope'), 8795), null)
  })

  it('clears stale PID file (process dead) and returns null', () => {
    const p = join(tmp, 'pid')
    writePidFile(p, 2_147_483_647, 8795)
    assert.equal(handleExistingProcess(p, 8795), null)
    assert.equal(existsSync(p), false)
  })

  it('returns {pid, port} when live PID matches requested port', () => {
    const p = join(tmp, 'pid')
    writePidFile(p, process.pid, 8795)
    const result = handleExistingProcess(p, 8795)
    assert.equal(result?.pid, process.pid)
    assert.equal(result?.port, 8795)
  })

  it('kills mismatched-port live PID and returns null', async () => {
    if (process.platform === 'win32') return
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
    await new Promise((r) => setTimeout(r, 50))
    const p = join(tmp, 'pid')
    writePidFile(p, child.pid, 8000)
    const result = handleExistingProcess(p, 9000)
    assert.equal(result, null)
    assert.equal(existsSync(p), false)
    // Process should have been killed.
    await new Promise((r) => setTimeout(r, 200))
    assert.equal(isProcessAlive(child.pid), false)
  })
})
