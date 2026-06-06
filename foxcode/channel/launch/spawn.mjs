/**
 * FoxCode — web-ext lifecycle: arg building, PID file, process-group control.
 *
 * Ported from launch_firefox.py (Python). The channel keeps Firefox attached
 * (not detached) so SIGTERM/SIGINT/stdin-EOF on the channel terminates the
 * whole web-ext process tree.
 */

import {
  writeFileSync,
  readFileSync,
  unlinkSync,
  existsSync,
  mkdirSync,
} from 'node:fs'
import { spawn as nodeSpawn } from 'node:child_process'
import { dirname } from 'node:path'

const UPDATE_PREFS = [
  '--pref=app.update.enabled=false',
  '--pref=app.update.auto=false',
  '--pref=app.update.service.enabled=false',
  '--pref=app.update.staging.enabled=false',
  '--pref=app.update.background.scheduling.enabled=false',
  '--pref=app.update.checkInstallTime=false',
]

/**
 * Build the argv passed to `npx web-ext run ...`.
 * @param {object} o
 * @param {string} o.extensionDir
 * @param {string} o.firefoxBinary
 * @param {string} o.profileDir
 * @param {number|null} [o.port]
 * @param {string|null} [o.password]
 * @param {boolean} [o.headless]
 * @returns {string[]}
 */
export function buildWebExtArgs(o) {
  if ((o.port == null) !== (o.password == null)) {
    throw new Error('buildWebExtArgs: port and password must be provided together')
  }
  const argv = [
    'web-ext', 'run',
    '--source-dir', o.extensionDir,
    '--firefox-profile', o.profileDir,
    '--keep-profile-changes',
    `--firefox=${o.firefoxBinary}`,
    ...UPDATE_PREFS,
  ]
  if (o.port != null && o.password != null) {
    argv.push('--start-url', `http://localhost:${o.port}#${o.port}:${o.password}`)
  }
  if (o.headless) argv.push('--args=--headless')
  return argv
}

/**
 * Persist the managed-browser PID file.
 *
 * Format is up to 3 lines: `browserPid\nport\nownerPid`. The third line
 * (the spawning server's pid) lets a later `launchBrowser` distinguish a
 * healthy browser (owner alive) from an orphan left by a hard-crashed owner
 * (owner dead) — see `handleExistingProcess` (F2). Legacy 2-line files (no
 * ownerPid) read back as `ownerPid: null` and are treated as healthy.
 *
 * @param {string} path
 * @param {number} pid browser (web-ext leader) pid
 * @param {number|null} port WebSocket port the browser was started against
 * @param {number} [ownerPid] pid of the server that spawned the browser
 */
export function writePidFile(path, pid, port, ownerPid) {
  mkdirSync(dirname(path), { recursive: true })
  let body
  if (ownerPid != null) {
    body = `${pid}\n${port == null ? '' : port}\n${ownerPid}\n`
  } else {
    body = port == null ? `${pid}\n` : `${pid}\n${port}\n`
  }
  writeFileSync(path, body, 'utf8')
}

/**
 * @param {string} path
 * @returns {{pid: number, port: number|null, ownerPid: number|null}|null}
 */
export function readPidFile(path) {
  let raw
  try { raw = readFileSync(path, 'utf8') } catch { return null }
  const lines = raw.trim().split(/\r?\n/)
  const pid = Number(lines[0])
  if (!Number.isFinite(pid) || pid <= 0) return null
  let port = lines.length > 1 && lines[1].length > 0 ? Number(lines[1]) : null
  if (port != null && !Number.isFinite(port)) port = null
  let ownerPid = lines.length > 2 && lines[2].length > 0 ? Number(lines[2]) : null
  if (ownerPid != null && !Number.isFinite(ownerPid)) ownerPid = null
  return { pid, port, ownerPid }
}

export function isProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err.code === 'EPERM'
  }
}

/**
 * SIGTERM the process group of `pid`; if still alive after `graceMs`, SIGKILL.
 * Resolves once the leader is observed dead (or grace expires after SIGKILL).
 *
 * @param {number} pid
 * @param {{graceMs?: number}} [opts]
 */
export async function killProcessGroup(pid, opts = {}) {
  const graceMs = opts.graceMs ?? 2000
  if (process.platform === 'win32') {
    try { process.kill(pid, 'SIGTERM') } catch { /* gone */ }
    return
  }
  // Negative pid → process group.
  const tryKill = (signal) => {
    try { process.kill(-pid, signal) } catch {
      try { process.kill(pid, signal) } catch { /* gone */ }
    }
  }
  tryKill('SIGTERM')
  const deadline = Date.now() + graceMs
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return
    await new Promise((r) => setTimeout(r, 50))
  }
  if (isProcessAlive(pid)) tryKill('SIGKILL')
  // Final brief wait for SIGKILL to land.
  const finalDeadline = Date.now() + 500
  while (Date.now() < finalDeadline && isProcessAlive(pid)) {
    await new Promise((r) => setTimeout(r, 25))
  }
}

/**
 * Decide what to do about an existing PID file. Returns a verdict; performs
 * the orphan-reap kill (the ONLY sanctioned kill) when the owner is dead.
 *
 * A live browser is NEVER killed for a port mismatch — multi-session-per-folder
 * relies on reusing one browser across many server ports (the browser learns
 * each session's port via the folder registry + pong siblings). The old
 * indiscriminate port-mismatch kill is removed.
 *
 * Verdicts:
 * - missing / malformed / browser pid dead → `{action: 'spawn'}` (PID file
 *   unlinked) — F3.
 * - browser alive + owner alive (or legacy `ownerPid: null`) →
 *   `{action: 'reuse', pid, port}` — reuse the existing browser.
 * - browser alive + owner DEAD → orphan: `killProcessGroup(browserPid)` +
 *   unlink, then `{action: 'spawn'}` — F2 reap. Awaits the group death so the
 *   profile lock is released before the caller spawns a fresh browser.
 *
 * @param {string} pidFile
 * @returns {Promise<{action: 'spawn'} | {action: 'reuse', pid: number, port: number|null}>}
 */
export async function handleExistingProcess(pidFile) {
  if (!existsSync(pidFile)) return { action: 'spawn' }
  const info = readPidFile(pidFile)
  if (!info) {
    try { unlinkSync(pidFile) } catch { /* ignore */ }
    return { action: 'spawn' }
  }
  if (!isProcessAlive(info.pid)) {
    try { unlinkSync(pidFile) } catch { /* ignore */ }
    return { action: 'spawn' }
  }
  // Browser alive. Owner dead (and known) → confirmed orphan: reap and respawn.
  // Requiring BOTH browser-alive AND owner-dead bounds the pid-reuse risk (F7):
  // two unrelated pids would have to collide simultaneously.
  if (info.ownerPid != null && !isProcessAlive(info.ownerPid)) {
    await killProcessGroup(info.pid)
    try { unlinkSync(pidFile) } catch { /* ignore */ }
    return { action: 'spawn' }
  }
  return { action: 'reuse', pid: info.pid, port: info.port }
}

/**
 * Spawn `npx web-ext run …` as an attached process-group leader.
 *
 * MCP stdio uses fd 1 of the channel for JSON-RPC framing. `web-ext run`
 * writes a human-readable banner ("Running web extension from …") to its
 * own stdout on startup, so the child's stdout MUST NOT inherit fd 1 of
 * the parent — that would corrupt the MCP transport mid-call (codex
 * closes the transport on the first non-JSON line). Child stdout is
 * piped and forwarded to the parent's stderr to keep diagnostics visible.
 *
 * @param {object} o see buildWebExtArgs
 * @param {Function} [spawnImpl] override for tests
 * @returns {import('node:child_process').ChildProcess}
 */
export function spawnWebExt(o, spawnImpl = nodeSpawn) {
  const argv = buildWebExtArgs(o)
  const proc = spawnImpl('npx', ['-y', ...argv], {
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'inherit'],
    env: process.env,
  })
  if (proc.stdout && typeof proc.stdout.on === 'function') {
    proc.stdout.on('data', (chunk) => {
      try { process.stderr.write(chunk) } catch { /* stderr closed */ }
    })
  }
  return proc
}
