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

export function writePidFile(path, pid, port) {
  mkdirSync(dirname(path), { recursive: true })
  const body = port == null ? `${pid}\n` : `${pid}\n${port}\n`
  writeFileSync(path, body, 'utf8')
}

export function readPidFile(path) {
  let raw
  try { raw = readFileSync(path, 'utf8') } catch { return null }
  const lines = raw.trim().split(/\r?\n/)
  const pid = Number(lines[0])
  if (!Number.isFinite(pid) || pid <= 0) return null
  const port = lines.length > 1 && lines[1].length > 0 ? Number(lines[1]) : null
  if (port != null && !Number.isFinite(port)) return { pid, port: null }
  return { pid, port }
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
 * Decide what to do about an existing PID file.
 * - Missing/stale/malformed → null (proceed to spawn).
 * - Live + port matches → {pid, port} (caller skips spawn).
 * - Live + port mismatch → kill, clear PID, null (caller respawns).
 *
 * @param {string} pidFile
 * @param {number|null} currentPort
 */
export function handleExistingProcess(pidFile, currentPort) {
  if (!existsSync(pidFile)) return null
  const info = readPidFile(pidFile)
  if (!info) {
    try { unlinkSync(pidFile) } catch { /* ignore */ }
    return null
  }
  if (!isProcessAlive(info.pid)) {
    try { unlinkSync(pidFile) } catch { /* ignore */ }
    return null
  }
  if (currentPort != null && info.port !== currentPort) {
    // Synchronous kill, then clear.
    try { process.kill(-info.pid, 'SIGTERM') } catch {
      try { process.kill(info.pid, 'SIGTERM') } catch { /* ignore */ }
    }
    try { unlinkSync(pidFile) } catch { /* ignore */ }
    return null
  }
  return info
}

/**
 * Spawn `npx web-ext run …` as an attached process-group leader.
 * Stdout/stderr are forwarded to the parent's stderr so MCP stdio stays clean.
 *
 * @param {object} o see buildWebExtArgs
 * @param {Function} [spawnImpl] override for tests
 * @returns {import('node:child_process').ChildProcess}
 */
export function spawnWebExt(o, spawnImpl = nodeSpawn) {
  const argv = buildWebExtArgs(o)
  const proc = spawnImpl('npx', ['-y', ...argv], {
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'inherit', 'inherit'],
    env: process.env,
  })
  // Detach the child so we can signal its whole group via process.kill(-pid).
  if (process.platform !== 'win32' && typeof proc.unref === 'function') {
    // Keep handle but do not block event loop on its survival; channel manages.
  }
  return proc
}
