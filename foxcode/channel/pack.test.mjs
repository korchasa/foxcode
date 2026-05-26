import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { readFileSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ownPkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
)

let packJson
before(() => {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: __dirname,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const arr = JSON.parse(out)
  assert.equal(arr.length, 1, 'npm pack --dry-run produced multiple tarballs')
  packJson = arr[0]
})

describe('npm pack', () => {
  it('package name is scoped under @korchasa', () => {
    assert.ok(
      packJson.name.startsWith('@korchasa/'),
      `name must be scoped under @korchasa, got ${packJson.name}`,
    )
  })

  it('includes the three runtime source files and package.json', () => {
    const paths = packJson.files.map((f) => f.path)
    for (const required of ['server.mjs', 'lib.mjs', 'validator.mjs', 'package.json']) {
      assert.ok(paths.includes(required), `tarball must include ${required}, got ${paths.join(', ')}`)
    }
  })

  it('excludes test files', () => {
    const paths = packJson.files.map((f) => f.path)
    const tests = paths.filter((p) => p.endsWith('.test.mjs'))
    assert.deepEqual(tests, [], `tarball must not ship test files, got ${tests.join(', ')}`)
  })

  it('excludes node_modules and package-lock', () => {
    const paths = packJson.files.map((f) => f.path)
    const leaks = paths.filter((p) => p.startsWith('node_modules/') || p === 'package-lock.json')
    assert.deepEqual(leaks, [], `tarball leaks dev artefacts: ${leaks.join(', ')}`)
  })

  it('exposes a foxcode-channel bin entry pointing at server.mjs', () => {
    assert.equal(ownPkg.bin && ownPkg.bin['foxcode-channel'], 'server.mjs')
  })

  it('declares publishConfig.access = public so first scoped publish succeeds', () => {
    assert.equal(ownPkg.publishConfig && ownPkg.publishConfig.access, 'public')
  })
})
