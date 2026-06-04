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
