// Structure assertions for .github/workflows/ci.yml so the npm-publish
// pipeline can never silently regress to the «no publish for four months»
// state described in documents/tasks/2026/06/unify-mcp-distribution-via-npx.md.
//
// Pure file-inspection test: fast, no external deps, safe to run on every
// `check`. Invoked by scripts/check.sh.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const ymlPath = resolve(repo, '.github/workflows/ci.yml');
const yml = readFileSync(ymlPath, 'utf8');

test('ci.yml: workflow_dispatch input for explicit channel version (rc publishes)', () => {
  assert.match(yml, /workflow_dispatch:/, 'workflow_dispatch trigger missing');
  assert.match(
    yml,
    /channel_version:/,
    'workflow_dispatch.inputs.channel_version missing (needed for manual rc publishes)',
  );
});

test('ci.yml: dedicated channel-publish job (does not bump plugin SemVer)', () => {
  assert.match(
    yml,
    /channel-publish:/,
    'channel-publish job missing — rc publishes must not run via auto-release (which bumps plugin SemVer)',
  );
});

test('ci.yml: publishes foxcode-channel to npm with NPM_TOKEN', () => {
  assert.match(yml, /npm publish/, '`npm publish` step missing');
  assert.match(
    yml,
    /NPM_TOKEN/,
    'NPM_TOKEN secret reference missing (D0.3: token lives in GHA secret)',
  );
  assert.match(
    yml,
    /--access[= ]public/,
    '`npm publish --access public` required so unscoped publishes do not 402',
  );
});

test('ci.yml: post-publish gate verifies tarball exists on registry (P0.8)', () => {
  // Accept both quoted (`"foxcode-channel@..."`) and bare forms.
  assert.match(
    yml,
    /npm view ["']?foxcode-channel@/,
    'post-publish `npm view foxcode-channel@…` gate missing — required by Phase 0 P0.8',
  );
});

test('ci.yml: auto-release bumps lockstep file-set including opencode + .mcp.json pin', () => {
  // The current auto-release misses opencode/package.json and the
  // foxcode-channel@… pin in foxcode/.mcp.json. Lockstep without them is
  // impossible.
  assert.match(
    yml,
    /opencode\/package\.json/,
    'auto-release does not bump opencode/package.json — lockstep breaks',
  );
  assert.match(
    yml,
    /foxcode-channel@/,
    'auto-release does not rewrite the foxcode-channel@… pin in foxcode/.mcp.json',
  );
});

test('ci.yml: channel-deprecate job exists with deprecate_range workflow_dispatch input (P0.10)', () => {
  assert.match(
    yml,
    /deprecate_range:/,
    'workflow_dispatch.inputs.deprecate_range missing — required for npm deprecate via CI',
  );
  assert.match(
    yml,
    /channel-deprecate:/,
    'channel-deprecate job missing — npm deprecate must run via CI to keep NPM_TOKEN in GHA only (D0.3)',
  );
  assert.match(
    yml,
    /npm deprecate/,
    '`npm deprecate` step missing',
  );
});

test('ci.yml: auto-release rc-tag handling derives npm dist-tag from version', () => {
  // Prereleases (0.18.0-rc.1) must publish with --tag rc; stable with default
  // (latest). The workflow needs an explicit derivation, not a hardcoded tag.
  // Match `npm publish ... --tag` (not `git describe --tags`).
  assert.match(
    yml,
    /npm publish[^\n]*--tag\b/,
    '`npm publish --tag <…>` missing — rc versions would otherwise pollute the latest dist-tag',
  );
});
