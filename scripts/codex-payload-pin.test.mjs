// Lockstep: the CHANNEL_SPEC literal in scripts/build-plugin-payload.mjs
// matches foxcode/channel/package.json version (the npm-published channel
// the payload's .mcp.json snippet points to). Drift here resurrects the
// «obsolete claude/channel artifact» failure documented in
// documents/tasks/2026/06/unify-mcp-distribution-via-npx.md.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { CHANNEL_SPEC } from './build-plugin-payload.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const channelPkg = JSON.parse(
  readFileSync(resolve(repo, 'foxcode/channel/package.json'), 'utf8'),
);

test('build-plugin-payload.mjs: CHANNEL_SPEC matches channel package.json version', () => {
  assert.equal(
    CHANNEL_SPEC,
    `foxcode-channel@${channelPkg.version}`,
    `CHANNEL_SPEC drift — must equal foxcode-channel@${channelPkg.version}`,
  );
});

test('build-plugin-payload.mjs: CHANNEL_SPEC pins an exact SemVer (no range)', () => {
  assert.match(
    CHANNEL_SPEC,
    /^foxcode-channel@\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/,
    'CHANNEL_SPEC must pin exactly — no caret, no tilde, no `latest`',
  );
});
