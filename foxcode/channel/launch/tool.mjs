/**
 * FoxCode — launchBrowser MCP tool handler.
 *
 * The handler is built from injected dependencies so server.mjs can wire
 * production implementations and tests can verify the orchestration without
 * actually spawning Firefox.
 *
 * Multi-session-per-folder: N MCP servers in the same project dir share ONE
 * Firefox. The first to acquire the launch lock spawns it (the "owner");
 * later sessions get a `reuse` verdict and simply wait for the running browser
 * to discover and connect to their port (via the folder registry + pong
 * siblings). A healthy browser is never killed for a port mismatch. All
 * coordination state (PID file, launch lock) lives on disk so recovery after
 * any crash is driven by the next `launchBrowser`.
 */

import {
  existsSync, mkdirSync, unlinkSync, writeFileSync, readFileSync, statSync, renameSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { isProcessAlive } from './spawn.mjs'

const DEFAULT_TIMEOUT_MS = 30_000
/** A launch lock older than this (with a live holder) is treated as stale (F6). */
const LOCK_TTL_MS = 60_000

/**
 * Factory for the launchBrowser handler.
 *
 * @param {object} deps
 * @param {() => boolean} deps.hasClients
 * @param {() => string} deps.projectDir
 * @param {() => number|null} deps.port
 * @param {() => string} deps.password
 * @param {(home: string, port: number|null) => {purged: string[], killed: number[]}} deps.prepare
 * @param {() => string} deps.findExtensionDir
 * @param {(projectDir: string) => string|null} deps.findFirefox
 * @param {(opts: object) => {pid: number, child: object}} deps.spawn
 * @param {(pidFile: string) => Promise<{action: string, pid?: number, port?: number|null}>} deps.handleExisting
 * @param {(path: string, pid: number, port: number|null, ownerPid: number) => void} deps.writePidFile
 * @param {() => Promise<void>} deps.waitForClient resolves when the extension connects
 * @param {() => number} [deps.ownerPid] pid of this server process (default process.pid)
 * @param {string} deps.home user home (for prepare)
 * @returns {(args: {timeout?: number, headless?: boolean}) => Promise<object>}
 */
export function createLaunchHandler(deps) {
  let inFlight = null
  let managed = null // {pid, child, port}

  function pidFilePath() {
    return join(deps.projectDir(), '.foxcode', 'web-ext.pid')
  }

  function lockFilePath() {
    return join(deps.projectDir(), '.foxcode', 'launch.lock')
  }

  function profileDir() {
    return join(deps.projectDir(), '.foxcode', 'firefox-profile')
  }

  function ownerPid() {
    return deps.ownerPid ? deps.ownerPid() : process.pid
  }

  /**
   * Wait until the extension connects to THIS session or the timeout elapses.
   * @returns {Promise<boolean>} true if connected, false on timeout
   */
  function waitConnect(timeoutMs) {
    let timer
    return Promise.race([
      deps.waitForClient().then(() => { clearTimeout(timer); return true }),
      new Promise((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs) }),
    ])
  }

  /**
   * Crash-safe, folder-scoped launch lock (F6). Returns true if acquired.
   *
   * Fresh-lock path is atomic (`wx` exclusive create → exactly one of N racing
   * processes wins; the rest get EEXIST → false and wait via discovery).
   *
   * Stale-reclaim path (dead holder OR age > TTL): reclaim is made atomic by
   * `rename`-ing the stale lock to a process-unique `.claim` name — only one
   * contender can rename a given file (the rest get ENOENT → false), so two
   * processes can never both reclaim. We never blind-`unlink` the live path,
   * which is what made the previous version race (a slow contender could
   * delete a winner's fresh lock). Residual: a reclaimer could still capture a
   * lock a winner wrote within the sub-ms gap between our read and rename — the
   * Firefox profile lock backstops that (two browsers can't share one profile).
   */
  function acquireLaunchLock() {
    const lockPath = lockFilePath()
    mkdirSync(dirname(lockPath), { recursive: true })
    const tryWrite = () => {
      try {
        writeFileSync(lockPath, String(ownerPid()), { flag: 'wx' })
        return true
      } catch (err) {
        if (err.code !== 'EEXIST') throw err
        return false
      }
    }
    if (tryWrite()) return true
    let holderPid = NaN
    let mtimeMs = 0
    try {
      holderPid = Number(readFileSync(lockPath, 'utf8').trim())
      mtimeMs = statSync(lockPath).mtimeMs
    } catch { return tryWrite() } // lock vanished between calls — race to recreate
    const holderDead = !Number.isFinite(holderPid) || !isProcessAlive(holderPid)
    const stale = (Date.now() - mtimeMs) > LOCK_TTL_MS
    if (!(holderDead || stale)) return false // live, fresh holder → lose, wait
    process.stderr.write(`foxcode: reclaiming stale launch lock (holder ${holderPid})\n`)
    const claim = `${lockPath}.${ownerPid()}.claim`
    try {
      renameSync(lockPath, claim) // atomic capture — only one reclaimer wins
    } catch {
      return false // another contender already reclaimed/holds it
    }
    try { unlinkSync(claim) } catch { /* ignore */ }
    return tryWrite()
  }

  function releaseLaunchLock() {
    try { unlinkSync(lockFilePath()) } catch { /* ignore */ }
  }

  async function doLaunch(args = {}) {
    const timeoutMs = Number.isFinite(args.timeout) ? args.timeout : DEFAULT_TIMEOUT_MS
    const headless = !!args.headless

    if (deps.hasClients()) {
      return { status: 'already-connected' }
    }

    const currentPort = deps.port()
    const password = deps.password()
    if (currentPort == null) {
      return { status: 'error', reason: 'channel has no WebSocket port — cannot start Firefox' }
    }

    const pidFile = pidFilePath()
    const verdict = existsSync(pidFile)
      ? await deps.handleExisting(pidFile)
      : { action: 'spawn' }

    if (verdict.action === 'reuse') {
      // A healthy browser exists (owned by a live session). Wait for it to
      // discover our port and connect — no spawn, no kill.
      const ok = await waitConnect(timeoutMs)
      return ok
        ? { status: 'already-running', pid: verdict.pid, port: verdict.port }
        : { status: 'timeout', pid: verdict.pid, port: verdict.port, reason: 'extension did not connect to this session' }
    }

    const extensionDir = deps.findExtensionDir()
    const firefoxBinary = deps.findFirefox(deps.projectDir())
    if (!firefoxBinary) {
      return { status: 'error', reason: 'Firefox binary not found. Install Firefox.' }
    }

    // Folder-scoped launch lock: the first session spawns; concurrent peers
    // wait for the winner's browser to connect to them via discovery.
    if (!acquireLaunchLock()) {
      const ok = await waitConnect(timeoutMs)
      return ok
        ? { status: 'already-running', port: currentPort }
        : { status: 'timeout', port: currentPort, reason: 'another session is launching; extension did not connect' }
    }

    try {
      const { purged, killed } = deps.prepare(deps.home, currentPort)

      mkdirSync(profileDir(), { recursive: true })
      const { child, pid } = deps.spawn({
        extensionDir,
        firefoxBinary,
        profileDir: profileDir(),
        port: currentPort,
        password,
        headless,
      })
      managed = { pid, child, port: currentPort }

      deps.writePidFile(pidFile, pid, currentPort, ownerPid())

      const ok = await waitConnect(timeoutMs)
      return ok
        ? { status: 'connected', pid, port: currentPort, purged: purged.length, killed: killed.length }
        : { status: 'timeout', pid, port: currentPort, reason: 'no extension connect', purged: purged.length, killed: killed.length }
    } finally {
      releaseLaunchLock()
    }
  }

  function handler(args = {}) {
    if (!inFlight) {
      inFlight = doLaunch(args).finally(() => { inFlight = null })
    }
    return inFlight
  }

  handler.getManaged = () => managed
  handler.clearManaged = () => {
    if (managed) {
      try { unlinkSync(pidFilePath()) } catch { /* ignore */ }
    }
    managed = null
  }

  return handler
}
