/**
 * FoxCode — Firefox update preparation for the in-channel launcher.
 *
 * Direct Node port of _prepare_firefox_for_launch from
 * foxcode/skills/foxcode-run-project-profile/scripts/launch_firefox.py
 * (commit 8ca9453). Never blocks launch — purges staged update markers and
 * SIGTERMs zombie org.mozilla.updater processes that hold our FoxCode URL.
 *
 * Logging policy: only counts are written to stderr; raw `ps` lines never
 * escape this module (URL hash may carry the password).
 */

import { existsSync, statSync, readdirSync, rmSync, unlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const MARKER_FILES = new Set([
  'update.status',
  'update.version',
  'update.mar',
  'active-update.xml',
])
const MARKER_DIRS = new Set(['Updated.app'])

/**
 * Recursively remove every file/dir under `root` whose basename is in
 * MARKER_FILES/MARKER_DIRS. Returns the list of removed absolute paths.
 *
 * @param {string} root absolute path to scan
 * @returns {string[]}
 */
function scanAndRemove(root) {
  const removed = []
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return removed
  }
  for (const entry of entries) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      if (MARKER_DIRS.has(entry.name)) {
        try {
          rmSync(full, { recursive: true, force: true })
          removed.push(full)
        } catch { /* skip — best effort */ }
      } else {
        removed.push(...scanAndRemove(full))
      }
    } else if (entry.isFile() && MARKER_FILES.has(entry.name)) {
      try {
        unlinkSync(full)
        removed.push(full)
      } catch { /* skip */ }
    }
  }
  return removed
}

/**
 * Remove staged Firefox update markers under home/Library/Caches/Mozilla/updates.
 * No-op on platforms without that cache root (Linux/Windows).
 *
 * @param {string} home user home directory (`os.homedir()` for prod, tmp for tests)
 * @returns {string[]} absolute paths that were removed
 */
export function purgeStagedUpdates(home) {
  const root = join(home, 'Library', 'Caches', 'Mozilla', 'updates')
  let st
  try { st = statSync(root) } catch { return [] }
  if (!st.isDirectory()) return []
  return scanAndRemove(root)
}

/**
 * Default `ps` runner: invokes /bin/ps with the same flags as the Python port.
 * Returns the raw stdout (string) — caller must not log it.
 */
function defaultRunPs() {
  return execFileSync('ps', ['-axo', 'pid=,comm=,args='], {
    encoding: 'utf8',
    timeout: 2000,
  })
}

/**
 * SIGTERM org.mozilla.updater processes whose argv references the given port.
 * Skips on win32 or when port is nullish (dev mode has no authoritative URL).
 *
 * @param {number|null|undefined} port live MCP port
 * @param {{runPs?: () => string, kill?: (pid: number, signal: string) => void}} opts
 * @returns {number[]} PIDs that received SIGTERM
 */
export function killStaleFoxcodeUpdaters(port, opts = {}) {
  if (port == null || process.platform === 'win32') return []
  const runPs = opts.runPs ?? defaultRunPs
  const kill = opts.kill ?? ((pid, sig) => process.kill(pid, sig))

  let raw
  try { raw = runPs() } catch { return [] }
  if (typeof raw !== 'string' || raw.length === 0) return []

  const marker = `http://localhost:${port}`
  const killed = []
  for (const line of raw.split('\n')) {
    if (!line.includes('org.mozilla.updater')) continue
    if (!line.includes(marker)) continue
    const m = line.trim().match(/^(\d+)\s/)
    if (!m) continue
    const pid = Number(m[1])
    if (!Number.isFinite(pid)) continue
    try {
      kill(pid, 'SIGTERM')
      killed.push(pid)
    } catch { /* gone already */ }
  }
  return killed
}

/**
 * Always succeeds. Returns {purged, killed} so the caller can log counts.
 * Console output: a single line per non-empty result, never the raw ps output.
 *
 * @param {string} home
 * @param {number|null|undefined} port
 * @param {{runPs?: () => string, kill?: (pid: number, sig: string) => void, log?: (s: string) => void}} opts
 */
export function prepareFirefoxForLaunch(home, port, opts = {}) {
  const purged = purgeStagedUpdates(home)
  const killed = killStaleFoxcodeUpdaters(port, opts)
  const log = opts.log ?? ((s) => process.stderr.write(s + '\n'))
  if (purged.length > 0) log(`foxcode: purged ${purged.length} staged Firefox update marker(s)`)
  if (killed.length > 0) log(`foxcode: killed ${killed.length} stale org.mozilla.updater process(es)`)
  return { purged, killed }
}
