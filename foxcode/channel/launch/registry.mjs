/**
 * FoxCode — folder-scoped session registry.
 *
 * Coordination state for multi-session-per-folder discovery lives on disk at
 * `<projectDir>/.foxcode/sessions.json` so it survives any process crash:
 * recovery is driven by the NEXT `launchBrowser` (and the next pong tick)
 * reading these files, never by a live process relaying membership in RAM.
 *
 * The file holds ports + pids ONLY — no password/secret. The browser reuses
 * the machine-global password it already holds (from the owner tab's URL hash)
 * when it connects to an advertised sibling port. Folder isolation comes from
 * scoping the file to the project dir: a folder's browser only ever learns
 * same-folder ports, so it never cross-connects to another folder's servers.
 *
 * All writes are atomic (temp file + rename) and all reads are fail-soft
 * (corrupt/partial JSON → `[]`) so a half-written or garbage file can never
 * crash a server (F4). Concurrent writers may momentarily drop an entry, but
 * every server re-registers itself idempotently each pong tick, so dropped
 * entries reappear within one tick (F5 eventual consistency).
 */

import { readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { isProcessAlive } from './spawn.mjs'

/** @param {string} projectDir */
export function registryPath(projectDir) {
  return join(projectDir, '.foxcode', 'sessions.json')
}

/**
 * Read the registry, fail-soft. Missing / corrupt / non-array → `[]`.
 * Never throws (F4). Entries are normalised to `{port, pid}` with finite
 * numbers; malformed entries are dropped.
 * @param {string} projectDir
 * @returns {{port: number, pid: number}[]}
 */
export function readRegistry(projectDir) {
  let raw
  try {
    raw = readFileSync(registryPath(projectDir), 'utf8')
  } catch {
    return []
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter((e) => e && Number.isFinite(e.port) && Number.isFinite(e.pid))
    .map((e) => ({ port: e.port, pid: e.pid }))
}

/** Atomically replace the registry file contents. */
function writeRegistry(projectDir, entries) {
  const path = registryPath(projectDir)
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(entries), 'utf8')
  renameSync(tmp, path)
}

/**
 * Upsert this session into the registry, pruning entries whose pid is dead.
 * Idempotent (safe to call every pong tick). Other live entries are preserved.
 * @param {string} projectDir
 * @param {{port: number, pid: number}} self
 */
export function register(projectDir, self) {
  const entries = readRegistry(projectDir)
    .filter((e) => e.port !== self.port && isProcessAlive(e.pid))
  entries.push({ port: self.port, pid: self.pid })
  writeRegistry(projectDir, entries)
}

/**
 * Best-effort removal of a port's entry. Skips silently on any error so a
 * crashing shutdown never propagates (the dead entry is pruned on next read).
 * @param {string} projectDir
 * @param {number} port
 */
export function unregister(projectDir, port) {
  try {
    const entries = readRegistry(projectDir).filter((e) => e.port !== port)
    if (entries.length === 0) {
      try { unlinkSync(registryPath(projectDir)) } catch { /* already gone */ }
      return
    }
    writeRegistry(projectDir, entries)
  } catch { /* best-effort */ }
}

/**
 * Return the ports of all live sessions (dead pids pruned).
 * @param {string} projectDir
 * @returns {number[]}
 */
export function listLivePorts(projectDir) {
  return readRegistry(projectDir)
    .filter((e) => isProcessAlive(e.pid))
    .map((e) => e.port)
}
