import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  registryPath,
  readRegistry,
  register,
  unregister,
  listLivePorts,
} from './registry.mjs'

const DEAD_PID = 2_147_483_647 // huge PID unlikely to exist
const LIVE_PID = process.pid

describe('registry', () => {
  let proj
  beforeEach(() => { proj = mkdtempSync(join(tmpdir(), 'foxcode-reg-')) })
  afterEach(() => { rmSync(proj, { recursive: true, force: true }) })

  function writeRaw(entries) {
    const dir = join(proj, '.foxcode')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'sessions.json'), JSON.stringify(entries), 'utf8')
  }

  it('registryPath points at <projectDir>/.foxcode/sessions.json', () => {
    assert.equal(registryPath(proj), join(proj, '.foxcode', 'sessions.json'))
  })

  it('readRegistry returns [] when the file is missing', () => {
    assert.deepEqual(readRegistry(proj), [])
  })

  it('register + readRegistry round-trip carries a live entry', () => {
    register(proj, { port: 8806, pid: LIVE_PID })
    const entries = readRegistry(proj)
    assert.equal(entries.length, 1)
    assert.equal(entries[0].port, 8806)
    assert.equal(entries[0].pid, LIVE_PID)
  })

  it('unregister removes the entry for a port', () => {
    register(proj, { port: 8806, pid: LIVE_PID })
    register(proj, { port: 8807, pid: LIVE_PID })
    unregister(proj, 8806)
    const ports = readRegistry(proj).map((e) => e.port)
    assert.deepEqual(ports.sort(), [8807])
  })

  it('register prunes dead-pid entries before writing', () => {
    writeRaw([{ port: 8800, pid: DEAD_PID }, { port: 8801, pid: LIVE_PID }])
    register(proj, { port: 8806, pid: LIVE_PID })
    const ports = readRegistry(proj).map((e) => e.port).sort()
    assert.deepEqual(ports, [8801, 8806], 'dead 8800 pruned, live 8801 + self 8806 kept')
  })

  it('register is idempotent — re-registering the same port does not duplicate', () => {
    register(proj, { port: 8806, pid: LIVE_PID })
    register(proj, { port: 8806, pid: LIVE_PID })
    const entries = readRegistry(proj)
    assert.equal(entries.length, 1)
  })

  it('register upserts (updates pid) for an existing port', () => {
    writeRaw([{ port: 8806, pid: LIVE_PID }])
    register(proj, { port: 8806, pid: LIVE_PID })
    const e = readRegistry(proj).find((x) => x.port === 8806)
    assert.equal(e.pid, LIVE_PID)
  })

  it('register preserves other live entries (F5 eventual consistency)', () => {
    register(proj, { port: 8806, pid: LIVE_PID })
    register(proj, { port: 8807, pid: LIVE_PID })
    const ports = readRegistry(proj).map((e) => e.port).sort()
    assert.deepEqual(ports, [8806, 8807])
  })

  it('readRegistry returns [] on corrupt/partial JSON and never throws (F4)', () => {
    const dir = join(proj, '.foxcode')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'sessions.json'), '{ this is not valid json', 'utf8')
    assert.deepEqual(readRegistry(proj), [])
  })

  it('register on a corrupt registry treats it as empty and writes self (F4)', () => {
    const dir = join(proj, '.foxcode')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'sessions.json'), 'GARBAGE', 'utf8')
    register(proj, { port: 8806, pid: LIVE_PID })
    const entries = readRegistry(proj)
    assert.equal(entries.length, 1)
    assert.equal(entries[0].port, 8806)
  })

  it('listLivePorts excludes dead-pid entries', () => {
    writeRaw([{ port: 8800, pid: DEAD_PID }, { port: 8801, pid: LIVE_PID }])
    assert.deepEqual(listLivePorts(proj), [8801])
  })

  it('atomic write leaves no .tmp file behind', () => {
    register(proj, { port: 8806, pid: LIVE_PID })
    const dir = join(proj, '.foxcode')
    const leftovers = readdirSync(dir).filter((f) => f.endsWith('.tmp'))
    assert.deepEqual(leftovers, [], 'no temp file should survive an atomic write')
    assert.ok(existsSync(join(dir, 'sessions.json')))
  })

  it('registry entries contain ports + pids only — no password/secret field', () => {
    register(proj, { port: 8806, pid: LIVE_PID })
    const raw = readFileSync(join(proj, '.foxcode', 'sessions.json'), 'utf8')
    assert.equal(/password|secret|token/i.test(raw), false, 'no secret may be persisted in the registry')
    const keys = Object.keys(readRegistry(proj)[0]).sort()
    assert.deepEqual(keys, ['pid', 'port'])
  })
})
