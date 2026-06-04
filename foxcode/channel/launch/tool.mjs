/**
 * FoxCode — launchBrowser MCP tool handler.
 *
 * The handler is built from injected dependencies so server.mjs can wire
 * production implementations and tests can verify the orchestration without
 * actually spawning Firefox.
 */

import { existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const DEFAULT_TIMEOUT_MS = 30_000

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
 * @param {() => string|null} deps.findFirefox
 * @param {(opts: object) => {pid: number, child: object}} deps.spawn
 * @param {() => Promise<void>} deps.waitForClient resolves when the extension connects
 * @param {string} deps.home user home (for prepare)
 * @returns {(args: {timeout?: number, headless?: boolean}) => Promise<object>}
 */
export function createLaunchHandler(deps) {
  let inFlight = null
  let managed = null // {pid, child, port}

  function pidFilePath() {
    return join(deps.projectDir(), '.foxcode', 'web-ext.pid')
  }

  function profileDir() {
    return join(deps.projectDir(), '.foxcode', 'firefox-profile')
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
    if (existsSync(pidFile)) {
      const existing = deps.handleExisting(pidFile, currentPort)
      if (existing) return { status: 'already-running', pid: existing.pid, port: existing.port }
    }

    const extensionDir = deps.findExtensionDir()
    const firefoxBinary = deps.findFirefox()
    if (!firefoxBinary) {
      return { status: 'error', reason: 'Firefox binary not found. Install Firefox.' }
    }

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

    deps.writePidFile(pidFile, pid, currentPort)

    let timer
    try {
      await Promise.race([
        deps.waitForClient(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), timeoutMs)
        }),
      ])
      clearTimeout(timer)
      return {
        status: 'connected',
        pid,
        port: currentPort,
        purged: purged.length,
        killed: killed.length,
      }
    } catch (err) {
      clearTimeout(timer)
      return {
        status: 'timeout',
        pid,
        port: currentPort,
        reason: err.message || 'no extension connect',
        purged: purged.length,
        killed: killed.length,
      }
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
