import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = join(__dirname, '..', '..')
const SCRIPT = join(REPO, 'scripts', 'release.sh')

const VERSIONED_FILES = [
  'foxcode/.claude-plugin/plugin.json',
  'foxcode/channel/package.json',
  'opencode/package.json',
]

function captureMtimes() {
  const out = {}
  for (const rel of VERSIONED_FILES) {
    out[rel] = statSync(join(REPO, rel)).mtimeMs
  }
  return out
}

function readVersion(rel) {
  return JSON.parse(readFileSync(join(REPO, rel), 'utf8')).version
}

describe('scripts/release.sh', () => {
  it('exists and is executable', () => {
    const st = statSync(SCRIPT)
    assert.ok(st.isFile(), `${SCRIPT} must be a file`)
    assert.ok((st.mode & 0o111) !== 0, `${SCRIPT} must be executable`)
  })

  it('rejects invalid SemVer with non-zero exit', () => {
    let err
    try {
      execFileSync(SCRIPT, ['--dry-run', 'not-a-version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (e) {
      err = e
    }
    assert.ok(err, 'expected non-zero exit for invalid version')
  })

  it('--dry-run does not modify any tracked file', () => {
    const before = captureMtimes()
    const beforeVersions = Object.fromEntries(
      VERSIONED_FILES.map((r) => [r, readVersion(r)]),
    )

    const out = execFileSync(SCRIPT, ['--dry-run', '99.99.99'], {
      cwd: REPO,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const after = captureMtimes()
    const afterVersions = Object.fromEntries(
      VERSIONED_FILES.map((r) => [r, readVersion(r)]),
    )
    for (const rel of VERSIONED_FILES) {
      assert.equal(before[rel], after[rel], `${rel} mtime changed during --dry-run`)
      assert.equal(
        beforeVersions[rel],
        afterVersions[rel],
        `${rel} version changed during --dry-run`,
      )
    }
    assert.match(out, /99\.99\.99/)
    for (const rel of VERSIONED_FILES) {
      assert.match(out, new RegExp(rel.replace(/[/.]/g, (c) => `\\${c}`)))
    }
  })

  it('directs the operator to CI as the authoritative releaser', () => {
    // release.sh is a local preview only — the real publish runs in
    // .github/workflows/ci.yml::auto-release. It must NOT instruct the user
    // to run `npm publish` (that path was silently skipped for 4 months and
    // is the root cause of documents/tasks/2026/06/unify-mcp-distribution-via-npx.md).
    const out = execFileSync(SCRIPT, ['--dry-run', '99.99.99'], {
      cwd: REPO,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    assert.match(out, /CI|workflows/i)
    assert.doesNotMatch(out, /npm publish/)
  })
})
