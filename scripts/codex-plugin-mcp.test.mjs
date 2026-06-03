import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPluginPayload } from './build-plugin-payload.mjs';
import { findFreePort } from '../opencode/lib/test-helpers.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');

class StdioMcpClient {
  constructor(child) {
    this.child = child;
    this.buffer = '';
    this.pending = new Map();
    this.nextId = 1;
    this.stderr = '';
    child.stderr.on('data', (chunk) => this.stderr += chunk.toString('utf8'));
    child.stdout.on('data', (chunk) => this.onData(chunk));
  }

  onData(chunk) {
    this.buffer += chunk.toString('utf8');
    let nl;
    while ((nl = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.id == null || !this.pending.has(msg.id)) continue;
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  }

  request(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request ${method} timed out\nstderr:\n${this.stderr}`));
      }, 30_000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  notify(method, params = {}) {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  async close() {
    this.child.stdin.end();
    await new Promise((resolve) => {
      this.child.once('close', resolve);
      setTimeout(() => {
        try {
          this.child.kill('SIGTERM');
        } catch {}
        resolve();
      }, 2_000);
    });
  }
}

const SMOKE = process.env.FOXCODE_SMOKE === '1';

test('installed codex mcp tools list + status reports spawn cwd as project dir (Q1)', {
  skip: SMOKE ? false : 'set FOXCODE_SMOKE=1 to run (resolves channel via npx; ~10–60s cold)',
}, async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'foxcode-payload-'));
  const home = await mkdtemp(path.join(tmpdir(), 'foxcode-npx-home-'));
  const userProjectDir = await mkdtemp(path.join(tmpdir(), 'foxcode-user-project-'));
  await mkdir(path.join(home, '.foxcode'), { recursive: true });
  await buildPluginPayload({ repoRoot, outDir });

  const pluginRoot = path.join(outDir, 'codex/plugins/foxcode');
  const mcp = JSON.parse(await readFile(path.join(pluginRoot, '.mcp.json'), 'utf8'));
  const server = mcp.foxcode;
  // Spawn with cwd = a temp «user project dir», NOT the plugin cache.
  // The .mcp.json snippet has no `cwd` field, so codex (or any MCP host)
  // forwards its own cwd to the child. The channel's `status` tool must
  // report that dir as projectDir — proves Q1 (codex does not force cwd
  // to plugin root when the snippet omits it).
  const child = spawn(server.command, server.args, {
    cwd: userProjectDir,
    env: {
      ...process.env,
      HOME: home,
      FOXCODE_PORT: String(await findFreePort()),
      npm_config_cache: path.join(home, 'npm-cache'),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const client = new StdioMcpClient(child);

  try {
    await client.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'foxcode-codex-plugin-test', version: '0.0.0' },
    });
    client.notify('notifications/initialized');
    const list = await client.request('tools/list');
    const names = list.tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, ['evalInBrowser', 'status']);

    const statusResult = await client.request('tools/call', {
      name: 'status',
      arguments: {},
    });
    const text = statusResult.content.find((c) => c.type === 'text')?.text;
    assert.ok(text, 'status response must include text content');
    const parsed = JSON.parse(text);
    // Realpath alignment: macOS tmpdir is a symlink (/var → /private/var);
    // both sides normalise via fs.realpathSync inside the channel and here.
    const expected = (await import('node:fs')).realpathSync(userProjectDir);
    const actual = (await import('node:fs')).realpathSync(parsed.projectDir);
    assert.equal(
      actual,
      expected,
      `channel reported projectDir=${parsed.projectDir} (realpath ${actual}); ` +
        `expected user project dir ${userProjectDir} (realpath ${expected}). ` +
        `If they differ, Q1 fallback (SessionStart hook writing ~/.foxcode/codex-project-dir) is needed.`,
    );
  } finally {
    await client.close();
  }
});
