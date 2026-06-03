// Phase 1 acceptance: foxcode/.mcp.json (CC plugin MCP config) is the
// npx-shaped snippet pinning the channel at the Phase-0-promoted version.
// Guards against:
//   - regression to the pre-Phase-1 `sh -c "npm ci → node server.mjs"` form
//   - drift between the pin literal here and the channel SemVer baseline
//   - accidental `cwd` / `env` fields (would override process.cwd() resolution)

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');

const mcp = JSON.parse(
  readFileSync(resolve(repo, 'foxcode/.mcp.json'), 'utf8'),
);
const channelPkg = JSON.parse(
  readFileSync(resolve(repo, 'foxcode/channel/package.json'), 'utf8'),
);

test('foxcode/.mcp.json: single `foxcode` MCP server entry', () => {
  assert.ok(mcp.mcpServers, '.mcpServers missing');
  assert.deepEqual(Object.keys(mcp.mcpServers), ['foxcode']);
});

test('foxcode/.mcp.json: command = "npx" (no sh-wrapper, no node)', () => {
  assert.equal(mcp.mcpServers.foxcode.command, 'npx');
});

test('foxcode/.mcp.json: args = ["-y", "foxcode-channel@<pin>"]', () => {
  const args = mcp.mcpServers.foxcode.args;
  assert.ok(Array.isArray(args), 'args must be an array');
  assert.equal(args.length, 2);
  assert.equal(args[0], '-y');
  assert.match(
    args[1],
    /^foxcode-channel@\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/,
    'args[1] must be foxcode-channel@<SemVer> with an exact pin',
  );
});

test('foxcode/.mcp.json: no `cwd` field (process.cwd() must inherit from MCP host)', () => {
  assert.ok(
    !('cwd' in mcp.mcpServers.foxcode),
    'cwd must be absent — setting it breaks project-dir resolution',
  );
});

test('foxcode/.mcp.json: no `env` field (npx needs no inject)', () => {
  assert.ok(
    !('env' in mcp.mcpServers.foxcode),
    'env must be absent — channel resolves project dir via process.cwd()',
  );
});

test('foxcode/.mcp.json: pin equals channel package.json version (lockstep)', () => {
  const pin = mcp.mcpServers.foxcode.args[1];
  assert.equal(
    pin,
    `foxcode-channel@${channelPkg.version}`,
    'pin literal drift vs foxcode/channel/package.json — release.sh / auto-release must rewrite both together',
  );
});
