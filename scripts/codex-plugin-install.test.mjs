import { mkdir, mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPluginPayload,
  detectCodexPluginAddSupport,
  findInstalledCodexPluginRoot,
} from './build-plugin-payload.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => stdout += chunk);
    child.stderr.on('data', (chunk) => stderr += chunk);
    child.on('error', (error) => resolve({ code: 127, stdout, stderr: error.message }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function codexAvailable() {
  const r = await run('codex', ['--version']);
  return r.code === 0;
}

const HAS_CODEX = await codexAvailable();

test('isolated codex plugin install', {
  skip: HAS_CODEX ? false : 'codex CLI not on PATH — install `codex` to run this test',
}, async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'foxcode-payload-'));
  const home = await mkdtemp(path.join(tmpdir(), 'foxcode-codex-home-'));
  const codexHome = path.join(home, '.codex');
  await mkdir(codexHome, { recursive: true });
  const env = {
    ...process.env,
    HOME: home,
    CODEX_HOME: codexHome,
  };

  await buildPluginPayload({ repoRoot, outDir });

  const help = await run('codex', ['plugin', '--help'], { env });
  assert.equal(help.code, 0, help.stderr);
  assert.equal(detectCodexPluginAddSupport(help.stdout), true);

  const marketplace = await run('codex', ['plugin', 'marketplace', 'add', path.join(outDir, 'codex')], { env });
  assert.equal(marketplace.code, 0, marketplace.stderr);

  const install = await run('codex', ['plugin', 'add', 'foxcode@korchasa'], { env });
  assert.equal(install.code, 0, install.stderr);

  const pluginRoot = await findInstalledCodexPluginRoot(codexHome, 'korchasa', 'foxcode');
  const plugin = JSON.parse(await readFile(path.join(pluginRoot, '.codex-plugin/plugin.json'), 'utf8'));
  assert.equal(plugin.name, 'foxcode');
  await stat(path.join(pluginRoot, 'skills/foxcode-run-project-profile/SKILL.md'));
  // The Firefox extension is no longer in the Codex plugin payload — it
  // ships inside the foxcode-channel npm package, fetched on first `npx`
  // invocation. Assert its absence so we don't silently regress.
  let extExists = false;
  try { await stat(path.join(pluginRoot, 'extension/manifest.json')); extExists = true; } catch { /* ENOENT */ }
  assert.equal(extExists, false, 'extension/ must NOT be in the Codex plugin payload anymore');
  await stat(path.join(pluginRoot, '.mcp.json'));

  // Q2: the installed plugin's MCP config surfaces in `codex mcp list`
  // without any user-edited ~/.codex/config.toml. Confirms the codex
  // marketplace install path wires the plugin's .mcp.json into the
  // effective MCP list.
  const mcpList = await run('codex', ['mcp', 'list', '--json'], { env });
  assert.equal(mcpList.code, 0, mcpList.stderr);
  let listed;
  try {
    listed = JSON.parse(mcpList.stdout);
  } catch (e) {
    assert.fail(`codex mcp list --json did not return JSON:\nstdout=${mcpList.stdout}\nstderr=${mcpList.stderr}`);
  }
  // Output shape varies across codex versions; check for `foxcode` in the
  // common shapes: top-level keys, an array of {name}, or a wrapper.
  const hasFoxcode =
    Object.prototype.hasOwnProperty.call(listed, 'foxcode') ||
    (Array.isArray(listed) && listed.some((s) => s?.name === 'foxcode')) ||
    (Array.isArray(listed?.servers) && listed.servers.some((s) => s?.name === 'foxcode')) ||
    JSON.stringify(listed).includes('"foxcode"');
  assert.ok(
    hasFoxcode,
    `\`codex mcp list --json\` did not surface the plugin's foxcode MCP entry:\n${mcpList.stdout}`,
  );
});
