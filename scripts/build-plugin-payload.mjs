import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Pinned at the foxcode-channel SemVer baseline declared by Phase 0 D0.2 and
// promoted to npm `latest` by P0.9. Updated in lockstep with
// foxcode/channel/package.json; the codex-payload-pin.test.mjs lockstep
// assertion catches drift.
export const CHANNEL_SPEC = 'foxcode-channel@0.18.0';

// npx-distribution model: payload ships only static assets (skills +
// manifests + .mcp.json snippet). Both the channel runtime AND the
// Firefox extension are resolved by `npx -y <CHANNEL_SPEC>` on first IDE
// invocation; the channel npm package bundles its own copy of the
// extension. Nothing in the payload needs the extension source either.
const RUNTIME_DIRS = ['skills'];

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function copyDirFiltered(src, dst, filter) {
  await mkdir(dst, { recursive: true });
  for (const entry of await readdir(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (!filter(srcPath, entry)) continue;
    if (entry.isDirectory()) {
      await copyDirFiltered(srcPath, dstPath, filter);
    } else if (entry.isFile()) {
      await mkdir(path.dirname(dstPath), { recursive: true });
      await cp(srcPath, dstPath);
    }
  }
}

function runtimeFilter(_srcPath, entry) {
  const name = entry.name;
  if (name === 'node_modules' || name === '.foxcode' || name === '.DS_Store') return false;
  return true;
}

async function copyRuntime(repoRoot, pluginRoot) {
  for (const dir of RUNTIME_DIRS) {
    await copyDirFiltered(
      path.join(repoRoot, 'foxcode', dir),
      path.join(pluginRoot, dir),
      runtimeFilter,
    );
  }
  await cp(path.join(repoRoot, 'plugin-src/shared/README.md'), path.join(pluginRoot, 'README.md'));
}

function mcpConfig(host) {
  const server = {
    command: 'npx',
    args: ['-y', CHANNEL_SPEC],
  };
  return host === 'claude' ? { mcpServers: { foxcode: server } } : { foxcode: server };
}

async function renderClaude(repoRoot, outDir, version) {
  const market = await readJson(path.join(repoRoot, 'plugin-src/claude/.claude-plugin/marketplace.json'));
  const plugin = await readJson(path.join(repoRoot, 'plugin-src/claude/plugins/foxcode/.claude-plugin/plugin.json'));
  plugin.version = version;

  const root = path.join(outDir, 'claude');
  const pluginRoot = path.join(root, 'plugins/foxcode');
  await writeJson(path.join(root, '.claude-plugin/marketplace.json'), market);
  await writeJson(path.join(pluginRoot, '.claude-plugin/plugin.json'), plugin);
  await writeJson(path.join(pluginRoot, '.mcp.json'), mcpConfig('claude'));
  await copyRuntime(repoRoot, pluginRoot);
}

async function renderCodex(repoRoot, outDir, version) {
  const market = await readJson(path.join(repoRoot, 'plugin-src/codex/.agents/plugins/marketplace.json'));
  const plugin = await readJson(path.join(repoRoot, 'plugin-src/codex/plugins/foxcode/.codex-plugin/plugin.json'));
  market.plugins[0].version = version;
  plugin.version = version;

  const root = path.join(outDir, 'codex');
  const pluginRoot = path.join(root, 'plugins/foxcode');
  await writeJson(path.join(root, '.agents/plugins/marketplace.json'), market);
  await writeJson(path.join(pluginRoot, '.codex-plugin/plugin.json'), plugin);
  await writeJson(path.join(pluginRoot, '.mcp.json'), mcpConfig('codex'));
  await copyRuntime(repoRoot, pluginRoot);
}

export async function buildPluginPayload({ repoRoot, outDir }) {
  const plugin = await readJson(path.join(repoRoot, 'foxcode/.claude-plugin/plugin.json'));
  if (typeof plugin.version !== 'string' || plugin.version.length === 0) {
    throw new Error('foxcode/.claude-plugin/plugin.json must contain a version string');
  }
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await renderClaude(repoRoot, outDir, plugin.version);
  await renderCodex(repoRoot, outDir, plugin.version);
  return { outDir, version: plugin.version };
}

export function detectCodexPluginAddSupport(helpText) {
  return /\badd\b/.test(helpText) && /Install a plugin/.test(helpText);
}

export async function findInstalledCodexPluginRoot(codexHome, marketplace, plugin) {
  const cacheRoot = path.join(codexHome, 'plugins/cache', marketplace, plugin);
  const entries = await readdir(cacheRoot, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(cacheRoot, entry.name);
    try {
      const manifest = await stat(path.join(candidate, '.codex-plugin/plugin.json'));
      if (manifest.isFile()) candidates.push(candidate);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) {
    throw new Error(`No installed Codex plugin root found under ${cacheRoot}`);
  }
  throw new Error(`Ambiguous Codex plugin roots under ${cacheRoot}: ${candidates.join(', ')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = process.argv[2] ?? path.resolve('dist/plugin-payload');
  await buildPluginPayload({ repoRoot: path.resolve(import.meta.dirname, '..'), outDir });
  console.log(`Wrote plugin payload to ${outDir}`);
}
