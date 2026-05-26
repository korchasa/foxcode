import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = join(__dirname, '..', '..')
const SCRIPT = join(REPO, 'scripts', 'test-npx-channel.sh')
const CHECK = join(REPO, 'scripts', 'check.sh')

describe('scripts/test-npx-channel.sh', () => {
  it('exists and is executable', () => {
    const st = statSync(SCRIPT)
    assert.ok(st.isFile())
    assert.ok((st.mode & 0o111) !== 0, 'script must be executable')
  })

  it('targets the @korchasa/foxcode-channel npm package', () => {
    const src = readFileSync(SCRIPT, 'utf8')
    assert.match(src, /@korchasa\/foxcode-channel/)
    assert.match(src, /npx/)
  })

  it('reads the pinned version from foxcode/channel/package.json (no hard-coded version)', () => {
    const src = readFileSync(SCRIPT, 'utf8')
    assert.match(
      src,
      /foxcode\/channel\/package\.json/,
      'smoke script must derive version from channel package.json',
    )
  })

  it('--print mode prints the planned npx invocation without executing it', () => {
    const out = execFileSync(SCRIPT, ['--print'], {
      cwd: REPO,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const channelVersion = JSON.parse(
      readFileSync(join(REPO, 'foxcode/channel/package.json'), 'utf8'),
    ).version
    assert.match(out, new RegExp(`@korchasa/foxcode-channel@${channelVersion.replace(/\./g, '\\.')}`))
  })
})

describe('scripts/check.sh integration', () => {
  it('check.sh gates the smoke test on FOXCODE_SMOKE=1 (opt-in)', () => {
    const src = readFileSync(CHECK, 'utf8')
    assert.match(src, /FOXCODE_SMOKE/)
    assert.match(src, /test-npx-channel\.sh/)
  })
})
