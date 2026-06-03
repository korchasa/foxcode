// Phase 0 P0.7 acceptance: the published `foxcode-channel@<ver>` package,
// resolved via `npx -y`, starts cleanly as a vanilla stdio MCP server,
// responds to `initialize`, and lists exactly `evalInBrowser` + `status`
// in `tools/list`. The failure mode this guards against: pre-0.18.0
// versions (0.1.0–0.4.2) require the `claude/channel` experimental
// capability and FATAL out against a vanilla MCP client.
//
// Opt-in: gated by FOXCODE_SMOKE=1 so the registry is not contacted on
// every `check`. Run as part of the Phase 0 release validation:
//
//   FOXCODE_SMOKE=1 node --test scripts/test-npx-channel-mcp.test.mjs

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, chmodSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');

const SMOKE = process.env.FOXCODE_SMOKE === '1';

const VERSION = JSON.parse(
  readFileSync(resolve(repo, 'foxcode/channel/package.json'), 'utf8'),
).version;
const SPEC = `foxcode-channel@${VERSION}`;

function findFreePort() {
  return new Promise((resolveP, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolveP(port));
    });
  });
}

class StdioMcpClient {
  constructor(child) {
    this.child = child;
    this.buffer = '';
    this.pending = new Map();
    this.nextId = 1;
    this.stderr = '';
    child.stderr.on('data', (b) => {
      this.stderr += b.toString('utf8');
    });
    child.stdout.on('data', (b) => this._onData(b));
  }

  _onData(buf) {
    this.buffer += buf.toString('utf8');
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
      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve: res, reject: rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) rej(new Error(`MCP error: ${JSON.stringify(msg.error)}`));
        else res(msg.result);
      }
    }
  }

  request(method, params) {
    const id = this.nextId++;
    return new Promise((res, rej) => {
      this.pending.set(id, { resolve: res, reject: rej });
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          rej(new Error(`MCP request '${method}' timed out\nstderr:\n${this.stderr}`));
        }
      }, 30_000);
    });
  }

  notify(method, params) {
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  async close() {
    this.child.stdin.end();
    await new Promise((res) => {
      this.child.once('close', res);
      setTimeout(() => {
        try {
          this.child.kill('SIGTERM');
        } catch {}
        res();
      }, 2_000);
    });
  }
}

async function spawnNpxChannel(home, port) {
  mkdirSync(join(home, '.foxcode'), { recursive: true, mode: 0o700 });
  writeFileSync(join(home, '.foxcode', 'password'), 'test-password-1234');
  chmodSync(join(home, '.foxcode', 'password'), 0o600);
  const child = spawn('npx', ['-y', SPEC], {
    env: {
      ...process.env,
      HOME: home,
      npm_config_cache: join(home, 'npm-cache'),
      FOXCODE_PORT: String(port),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return new StdioMcpClient(child);
}

test(`npx ${SPEC}: MCP initialize + tools/list returns evalInBrowser+status`, {
  skip: SMOKE ? false : 'set FOXCODE_SMOKE=1 to run (contacts npm registry, ~10–60s cold)',
}, async () => {
  const home = mkdtempSync(join(tmpdir(), 'foxcode-npx-mcp-'));
  try {
    const port = await findFreePort();
    const client = await spawnNpxChannel(home, port);
    try {
      const init = await client.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'phase-0-acceptance', version: '0.0.0' },
      });
      assert.ok(init.protocolVersion, 'initialize must echo protocolVersion');
      assert.ok(init.serverInfo?.name, 'initialize must include serverInfo.name');

      client.notify('notifications/initialized');
      const tools = await client.request('tools/list', {});
      assert.ok(Array.isArray(tools.tools), 'tools/list must return tools array');
      const names = tools.tools.map((t) => t.name).sort();
      assert.deepEqual(
        names,
        ['evalInBrowser', 'status'],
        `tools/list mismatch — got ${JSON.stringify(names)}. ` +
          `If the obsolete claude/channel-shaped 0.x line is being resolved, ` +
          `bump foxcode/channel/package.json to >=0.18.0 and republish.`,
      );

      assert.doesNotMatch(
        client.stderr,
        /claude\/channel/i,
        `npx-resolved server announced the obsolete claude/channel capability — ` +
          `${SPEC} is from the pre-MCP architecture (0.x line). Phase 0 must republish.`,
      );
    } finally {
      await client.close();
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
