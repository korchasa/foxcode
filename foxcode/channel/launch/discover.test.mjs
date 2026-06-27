import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  findExtensionDir,
  findFirefox,
  KNOWN_FIREFOX_PATHS,
} from './discover.mjs'

describe('findExtensionDir', () => {
  it('resolves to a sibling extension/ — bundled or dev', () => {
    // Two valid layouts:
    //   1. published: <channel>/extension/        (after prepack)
    //   2. dev:       <channel>/../extension/     (in-repo)
    // The function tries published first, then dev fallback.
    const ext = findExtensionDir()
    assert.match(
      ext,
      /foxcode\/channel\/extension$|foxcode\/extension$|foxcode\\channel\\extension$|foxcode\\extension$/,
    )
  })

  it('throws fail-fast when manifest.json is missing', () => {
    assert.throws(
      () => findExtensionDir({ override: '/nonexistent/path/that/should/not/exist' }),
      /manifest\.json/,
    )
  })

  it('returns override path when manifest.json present', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'foxcode-ext-'))
    try {
      writeFileSync(join(tmp, 'manifest.json'), '{}')
      const ext = findExtensionDir({ override: tmp })
      assert.equal(ext, tmp)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('findFirefox', () => {
  let tmp
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'foxcode-ff-'))
  })
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('returns the first executable search path', () => {
    const ff = join(tmp, 'fake-firefox')
    writeFileSync(ff, '#!/bin/sh\nexit 0\n')
    chmodSync(ff, 0o755)
    const found = findFirefox({ searchPaths: [ff], useDefaults: false })
    assert.equal(found, ff)
  })

  it('skips paths that are not executable', () => {
    const nonexec = join(tmp, 'nonexec')
    writeFileSync(nonexec, 'data')
    chmodSync(nonexec, 0o644)
    const found = findFirefox({ searchPaths: [nonexec], useDefaults: false })
    assert.equal(found, null)
  })

  it('returns null when neither search paths nor defaults match', () => {
    const found = findFirefox({ searchPaths: ['/nonexistent/firefox'], useDefaults: false })
    assert.equal(found, null)
  })

  it('exposes per-platform default paths via KNOWN_FIREFOX_PATHS', () => {
    assert.ok(Array.isArray(KNOWN_FIREFOX_PATHS.darwin))
    assert.ok(Array.isArray(KNOWN_FIREFOX_PATHS.linux))
    assert.ok(Array.isArray(KNOWN_FIREFOX_PATHS.win32))
    assert.ok(KNOWN_FIREFOX_PATHS.darwin[0].includes('Firefox.app'))
  })
})

describe('findFirefox — FOXCODE_FIREFOX_PATH override', () => {
  let tmp
  let saved
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'foxcode-ffenv-'))
    saved = process.env.FOXCODE_FIREFOX_PATH
    delete process.env.FOXCODE_FIREFOX_PATH
  })
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
    if (saved === undefined) delete process.env.FOXCODE_FIREFOX_PATH
    else process.env.FOXCODE_FIREFOX_PATH = saved
  })

  it('returns the override binary, taking priority over search paths and defaults', () => {
    const override = join(tmp, 'moirai-firefox')
    writeFileSync(override, '#!/bin/sh\nexit 0\n')
    chmodSync(override, 0o755)
    const other = join(tmp, 'other-firefox')
    writeFileSync(other, '#!/bin/sh\nexit 0\n')
    chmodSync(other, 0o755)
    process.env.FOXCODE_FIREFOX_PATH = override
    // searchPaths and defaults must be ignored when the override is set.
    const found = findFirefox({ searchPaths: [other], useDefaults: true })
    assert.equal(found, override)
  })

  it('throws fail-fast when the override is set but not executable', () => {
    const bad = join(tmp, 'not-executable')
    writeFileSync(bad, 'data')
    chmodSync(bad, 0o644)
    process.env.FOXCODE_FIREFOX_PATH = bad
    assert.throws(() => findFirefox(), /FOXCODE_FIREFOX_PATH/)
  })

  it('throws fail-fast when the override points to a missing file', () => {
    process.env.FOXCODE_FIREFOX_PATH = join(tmp, 'does-not-exist')
    assert.throws(() => findFirefox(), /FOXCODE_FIREFOX_PATH/)
  })

  it('falls through to normal discovery when the override is empty', () => {
    process.env.FOXCODE_FIREFOX_PATH = ''
    const ff = join(tmp, 'fake-firefox')
    writeFileSync(ff, '#!/bin/sh\nexit 0\n')
    chmodSync(ff, 0o755)
    const found = findFirefox({ searchPaths: [ff], useDefaults: false })
    assert.equal(found, ff)
  })
})
