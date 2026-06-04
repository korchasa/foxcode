import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPluginPayload } from './build-plugin-payload.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const channelPkg = JSON.parse(
  await readFile(path.join(repoRoot, 'foxcode/channel/package.json'), 'utf8'),
);
const CHANNEL_VERSION = channelPkg.version;

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

test('codex marketplace payload shape', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'foxcode-payload-'));

  await buildPluginPayload({ repoRoot, outDir });

  const marketplace = await readJson(path.join(outDir, 'codex/.agents/plugins/marketplace.json'));
  assert.equal(marketplace.name, 'korchasa');
  assert.equal(marketplace.plugins[0].name, 'foxcode');
  assert.deepEqual(marketplace.plugins[0].source, {
    source: 'local',
    path: './plugins/foxcode',
  });

  const plugin = await readJson(path.join(outDir, 'codex/plugins/foxcode/.codex-plugin/plugin.json'));
  assert.equal(plugin.name, 'foxcode');
  assert.equal(plugin.skills, './skills/');
  assert.equal(plugin.mcpServers, './.mcp.json');

  const mcp = await readJson(path.join(outDir, 'codex/plugins/foxcode/.mcp.json'));
  assert.equal(mcp.foxcode.command, 'npx');
  assert.deepEqual(mcp.foxcode.args, [
    '-y',
    `foxcode-channel@${CHANNEL_VERSION}`,
  ]);
  assert.equal(Object.hasOwn(mcp, 'mcpServers'), false);
  // npx-distribution model: no `cwd`, no `env`. Channel resolves project
  // dir via process.cwd() inherited from the MCP host.
  assert.equal(Object.hasOwn(mcp.foxcode, 'cwd'), false);
  assert.equal(Object.hasOwn(mcp.foxcode, 'env'), false);

  await stat(path.join(outDir, 'codex/plugins/foxcode/skills/foxcode-run-project-profile/SKILL.md'));
  await stat(path.join(outDir, 'claude/.claude-plugin/marketplace.json'));
});

test('payload does NOT ship channel/ or extension/ under unified-npx distribution', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'foxcode-payload-'));
  await buildPluginPayload({ repoRoot, outDir });

  for (const host of ['codex', 'claude']) {
    for (const dead of ['channel', 'extension']) {
      const dir = path.join(outDir, host, 'plugins/foxcode', dead);
      let exists = false;
      try {
        await stat(dir);
        exists = true;
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
      assert.equal(
        exists,
        false,
        `${host} payload still ships ${dead}/ — channel npm package now bundles it`,
      );
    }
  }
});
