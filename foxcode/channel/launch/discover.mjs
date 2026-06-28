/**
 * FoxCode — Firefox + extension discovery for the in-channel launcher.
 *
 * Ported from foxcode/skills/foxcode-run-project-profile/scripts/resolve_env.py
 * with two simplifications:
 *  - Extension is bundled into the npm package; resolution is import.meta.url
 *    based — no CLAUDE_PLUGIN_ROOT, no OpenCode handoff file.
 *  - No on-disk config cache for discovery. The only field read back from
 *    `<projectDir>/.foxcode/config.json` is the optional `firefox` binary
 *    override (see findFirefox); everything else is computed fresh.
 */

import { existsSync, statSync, accessSync, readFileSync, constants } from 'node:fs'
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
 * Read the optional per-project Firefox binary override from
 * `<projectDir>/.foxcode/config.json` (`firefox` field). Returns the configured
 * path string, or null when there is no project dir, no config file, or no
 * `firefox` field. A corrupt config file is a hard error (fail-fast) — it is an
 * explicit, fixable mistake, not a reason to silently guess.
 *
 * @param {string|null|undefined} projectDir
 * @returns {string|null}
 */
export function readProjectFirefoxOverride(projectDir) {
  if (!projectDir) return null
  const configPath = join(projectDir, '.foxcode', 'config.json')
  let raw
  try {
    raw = readFileSync(configPath, 'utf8')
  } catch {
    return null // no per-project config — not an override
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`FoxCode project config ${configPath} is not valid JSON: ${err.message}`)
  }
  const firefox = parsed?.firefox
  if (firefox == null || firefox === '') return null
  if (typeof firefox !== 'string') {
    throw new Error(`FoxCode project config ${configPath}: "firefox" must be a string path`)
  }
  return firefox
}

/**
 * Find Firefox binary. Returns absolute path or null.
 *
 * Override precedence (first match wins):
 *  1. `FOXCODE_FIREFOX_PATH` env var — explicit, global escape hatch. Must point
 *     to an executable file, else we throw (fail-fast): a hand-set override that
 *     is wrong should surface loudly, never silently fall back.
 *  2. Per-project `firefox` field in `<projectDir>/.foxcode/config.json`. Often
 *     legacy auto-populated data, so it is lenient: an executable path is used,
 *     a non-executable one is warned about on stderr and skipped (discovery
 *     continues) rather than breaking launch across every project at once.
 *  3. Caller-supplied searchPaths, then platform defaults / PATH lookup.
 *
 * @param {{searchPaths?: string[], useDefaults?: boolean, projectDir?: string|null}} opts
 */
export function findFirefox(opts = {}) {
  const { searchPaths = [], useDefaults = true, projectDir = null } = opts
  const envOverride = process.env.FOXCODE_FIREFOX_PATH
  if (envOverride) {
    if (!isExecutable(envOverride)) {
      throw new Error(
        `FOXCODE_FIREFOX_PATH is set to "${envOverride}" but it is not an executable file`,
      )
    }
    return envOverride
  }
  const projectOverride = readProjectFirefoxOverride(projectDir)
  if (projectOverride) {
    if (isExecutable(projectOverride)) return projectOverride
    process.stderr.write(
      `foxcode: ignoring non-executable firefox override "${projectOverride}" ` +
        `from ${join(projectDir, '.foxcode', 'config.json')}; falling back to discovery\n`,
    )
  }
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
