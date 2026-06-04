import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import {
  purgeStagedUpdates,
  killStaleFoxcodeUpdaters,
  prepareFirefoxForLaunch,
} from './prepare.mjs'

function makeStagedUpdate(home) {
  const channel = join(home, 'Library', 'Caches', 'Mozilla', 'updates', 'Applications', 'Firefox Moirai')
  const updateDir = join(channel, 'updates', '0')
  mkdirSync(updateDir, { recursive: true })
  writeFileSync(join(updateDir, 'update.status'), 'applied\n')
  writeFileSync(join(updateDir, 'update.version'), '152.0\n')
  writeFileSync(join(updateDir, 'update.mar'), 'fake-mar')
  mkdirSync(join(updateDir, 'Updated.app'), { recursive: true })
  writeFileSync(join(channel, 'active-update.xml'), '<updates/>')
  return { channel, updateDir }
}

describe('purgeStagedUpdates', () => {
  let home
  beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'foxcode-home-')) })
  afterEach(() => { rmSync(home, { recursive: true, force: true }) })

  it('removes every staged update marker file and Updated.app', () => {
    const { channel, updateDir } = makeStagedUpdate(home)
    const removed = purgeStagedUpdates(home)
    for (const f of ['update.status', 'update.version', 'update.mar']) {
      assert.equal(existsSync(join(updateDir, f)), false, `${f} should be purged`)
    }
    assert.equal(existsSync(join(updateDir, 'Updated.app')), false, 'Updated.app should be purged')
    assert.equal(existsSync(join(channel, 'active-update.xml')), false, 'active-update.xml should be purged')
    assert.ok(removed.length >= 5, `expected ≥5 removed entries, got ${removed.length}: ${removed.join(', ')}`)
  })

  it('purges a lone update.status marker', () => {
    const updateDir = join(home, 'Library', 'Caches', 'Mozilla', 'updates', 'Applications', 'Firefox', 'updates', '0')
    mkdirSync(updateDir, { recursive: true })
    const status = join(updateDir, 'update.status')
    writeFileSync(status, 'applied\n')
    const removed = purgeStagedUpdates(home)
    assert.equal(existsSync(status), false)
    assert.equal(removed.length, 1)
  })

  it('is idempotent on a clean home — no cache dir → empty result', () => {
    const removed = purgeStagedUpdates(home)
    assert.deepEqual(removed, [])
  })
})

describe('killStaleFoxcodeUpdaters', () => {
  it('returns [] when port is null', () => {
    const killed = killStaleFoxcodeUpdaters(null, { runPs: () => 'ignored' })
    assert.deepEqual(killed, [])
  })

  it('SIGTERMs every org.mozilla.updater row whose argv holds our port', async () => {
    // Spawn a long-running child that we expect to be SIGTERM'd.
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
    })
    try {
      // Wait briefly to ensure pid is alive.
      await new Promise((r) => setTimeout(r, 50))
      const psOutput = [
        `${child.pid} org.mozilla.updater http://localhost:8795#8795:secret`,
      ].join('\n') + '\n'
      const killed = killStaleFoxcodeUpdaters(8795, { runPs: () => psOutput })
      assert.deepEqual(killed, [child.pid])
      // Wait for exit signal to propagate.
      const exited = await new Promise((resolve) => {
        const t = setTimeout(() => resolve(false), 2000)
        child.on('exit', () => { clearTimeout(t); resolve(true) })
      })
      assert.equal(exited, true, 'spawned child should have been terminated by SIGTERM')
    } finally {
      if (child.exitCode == null && child.signalCode == null) child.kill('SIGKILL')
    }
  })

  it('ignores rows that match org.mozilla.updater but not our port', () => {
    const psOutput = '12345 org.mozilla.updater http://localhost:8888#8888:other\n'
    const killed = killStaleFoxcodeUpdaters(8795, { runPs: () => psOutput })
    assert.deepEqual(killed, [])
  })

  it('returns [] when ps runner throws (best-effort cleanup)', () => {
    const killed = killStaleFoxcodeUpdaters(8795, {
      runPs: () => { throw new Error('ps missing') },
    })
    assert.deepEqual(killed, [])
  })
})

describe('prepareFirefoxForLaunch', () => {
  let home
  beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'foxcode-prep-')) })
  afterEach(() => { rmSync(home, { recursive: true, force: true }) })

  it('combines purge + kill counts and never throws on a clean system', () => {
    const result = prepareFirefoxForLaunch(home, null, { runPs: () => '' })
    assert.equal(result.purged.length, 0)
    assert.equal(result.killed.length, 0)
  })

  it('reports purge count when staged updates exist (port-less skip on kill)', () => {
    makeStagedUpdate(home)
    const result = prepareFirefoxForLaunch(home, null, { runPs: () => '99999 org.mozilla.updater http://localhost:8795#8795:s\n' })
    assert.ok(result.purged.length >= 5)
    assert.deepEqual(result.killed, [], 'port-less call must skip the kill step')
  })
})
