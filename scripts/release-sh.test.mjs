// Structural assertions for scripts/release.sh — keeps the local preview
// in lockstep with the .github/workflows/ci.yml auto-release file-set.
// A drift here resurrects the four-month publish gap described in
// documents/tasks/2026/06/unify-mcp-distribution-via-npx.md.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const releaseSh = resolve(repo, 'scripts/release.sh');
const src = readFileSync(releaseSh, 'utf8');

const dryRun = (version = '9.9.9-test') => {
  const r = spawnSync('bash', [releaseSh, '--dry-run', version], {
    cwd: repo,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(`release.sh exited ${r.status}: ${r.stderr}`);
  }
  return r.stdout;
};

test('release.sh: always bumps the JSON + pin-literal lockstep file-set', () => {
  // Files release.sh ALWAYS mentions in its dry-run output. Must mirror
  // ci.yml::auto-release::Bump version and tag.
  const out = dryRun();
  const expected = [
    'foxcode/extension/manifest.json',
    'foxcode/channel/package.json',
    'foxcode/channel/package-lock.json',
    'foxcode/.claude-plugin/plugin.json',
    'opencode/package.json',
    // CHANNEL_SPEC literal in the Codex payload builder.
    'scripts/build-plugin-payload.mjs',
    // CHANNEL_SPEC literal in the OpenCode mcp entry source.
    'opencode/lib/foxcode-mcp-entry.mjs',
  ];
  for (const path of expected) {
    assert.match(
      out,
      new RegExp(path.replace(/\./g, '\\.')),
      `dry-run output does not mention ${path} — lockstep drift vs ci.yml auto-release`,
    );
  }
});

test('release.sh: rewrites foxcode/.mcp.json pin if the file already contains one', () => {
  // .mcp.json is conditional — the script bumps the pin literal IFF the
  // file already has `foxcode-channel@…`. Pre-Phase-1 main has the old
  // `npm ci → node server.mjs` form without a pin, so this test reads
  // the file and only asserts under the same precondition the script uses.
  const mcpPath = resolve(repo, 'foxcode/.mcp.json');
  const mcp = readFileSync(mcpPath, 'utf8');
  if (!/foxcode-channel@/.test(mcp)) {
    return;
  }
  const out = dryRun();
  assert.match(
    out,
    /foxcode\/\.mcp\.json/,
    'dry-run output omits foxcode/.mcp.json even though the file contains a foxcode-channel@ pin',
  );
});

test('release.sh: header declares CI as the authoritative releaser', () => {
  // Operator must understand release.sh is a local preview; the real publish
  // happens in CI via .github/workflows/ci.yml.
  assert.match(
    src,
    /CI|\.github\/workflows/i,
    'release.sh header does not reference CI — user might assume it publishes',
  );
  assert.doesNotMatch(
    src,
    /npm publish/,
    'release.sh must NOT invoke or instruct `npm publish` — that step lives in CI now',
  );
});
