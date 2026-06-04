/**
 * FoxCode — Firefox + extension discovery for the in-channel launcher.
 *
 * Ported from foxcode/skills/foxcode-run-project-profile/scripts/resolve_env.py
 * with two simplifications:
 *  - Extension is bundled into the npm package; resolution is import.meta.url
 *    based — no CLAUDE_PLUGIN_ROOT, no OpenCode handoff file.
 *  - No on-disk config cache (.foxcode/config.json). Discovery is cheap.
 */

import { existsSync, statSync, accessSync, constants } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { delimiter } from 'node:path'

const expandEnv = (p) => p.replace(/%([^%]+)%/g, (_, name) => process.env[name] ?? '')

export const KNOWN_FIREFOX_PATHS = {
  darwin: [
    '/Applications/Firefox.app/Contents/MacOS/firefox',
  ],
  linux: [
    '/usr/bin/firefox',
    '/usr/lib/firefox/firefox',
    '/snap/bin/firefox',
    '/usr/bin/firefox-esr',
  ],
  win32: [
    expandEnv('%ProgramFiles%\\Mozilla Firefox\\firefox.exe'),
    expandEnv('%ProgramFiles(x86)%\\Mozilla Firefox\\firefox.exe'),
    expandEnv('%LocalAppData%\\Mozilla Firefox\\firefox.exe'),
  ],
}

function isExecutable(path) {
  try {
    const st = statSync(path)
    if (!st.isFile()) return false
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function whichOnPath(name) {
  const exts = process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';')
    : ['']
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = join(dir, name + ext)
      if (isExecutable(candidate)) return candidate
    }
  }
  return null
}

/**
 * Find Firefox binary. Returns absolute path or null.
 * @param {{searchPaths?: string[], useDefaults?: boolean}} opts
 */
export function findFirefox(opts = {}) {
  const { searchPaths = [], useDefaults = true } = opts
  for (const p of searchPaths) {
    if (isExecutable(p)) return p
  }
  if (!useDefaults) return null
  for (const p of KNOWN_FIREFOX_PATHS[process.platform] ?? []) {
    if (isExecutable(p)) return p
  }
  for (const name of ['firefox', 'firefox-esr']) {
    const found = whichOnPath(name)
    if (found) return found
  }
  return null
}

/**
 * Resolve the FoxCode extension directory.
 *
 * Published (npm) layout:  <channel>/extension/        ← bundled by prepack
 * Dev layout (in-repo):    <channel>/../extension/     ← canonical sources
 *                          (channel sibling, since the channel lives at
 *                           foxcode/channel/ and the extension at foxcode/extension/)
 *
 * Tries published first, then dev fallback. Throws fail-fast if neither
 * has a manifest.json. The `override` option exists only for tests.
 *
 * @param {{override?: string}} opts
 */
export function findExtensionDir(opts = {}) {
  if (opts.override) {
    const abs = resolve(opts.override)
    const manifest = join(abs, 'manifest.json')
    if (!existsSync(manifest)) {
      throw new Error(`FoxCode extension manifest.json not found at ${manifest}`)
    }
    return abs
  }
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, '..', 'extension'),       // published: <channel>/extension/
    join(here, '..', '..', 'extension'), // dev: <channel>/../extension/ = foxcode/extension/
  ]
  for (const candidate of candidates) {
    const abs = resolve(candidate)
    if (existsSync(join(abs, 'manifest.json'))) return abs
  }
  throw new Error(
    `FoxCode extension manifest.json not found at any of: ${candidates.map(resolve).join(', ')}`,
  )
}
