/**
 * Acceptance: end-to-end bridge between the MCP-stdio client (an agent like
 * Claude Code or OpenCode) and the Firefox extension over WebSocket.
 *
 * Flow:
 *   MCP client → channel server (stdio) → channel server (ws) → fake extension
 *   fake extension → tool_response → channel server → MCP client
 *
 * The fake extension is a plain WebSocket client that mimics the protocol
 * documented in documents/design.md §5: receives `EVAL_CODE` messages,
 * responds with `EVAL_RESULT`. This validates the full request/response
 * lifecycle of evalInBrowser without needing a real Firefox instance.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

import { withTmp, findFreePort } from "../../lib/test-helpers.mjs";

const require = createRequire(import.meta.url);
const CHANNEL_DIR = new URL("../../../foxcode/channel/", import.meta.url).pathname;
const CHANNEL_SERVER = join(CHANNEL_DIR, "server.mjs");
// `ws` is a runtime dep of the channel; reuse its installed copy to avoid
// requiring opencode/node_modules during dev test runs.
const WSImpl = (() => {
  if (!existsSync(join(CHANNEL_DIR, "node_modules", "ws"))) {
    throw new Error("foxcode/channel/node_modules/ws not installed; run `cd foxcode/channel && npm ci`");
  }
  return require(join(CHANNEL_DIR, "node_modules", "ws"));
})();

const TEST_PASSWORD = "test-password-1234";


class StdioMcpClient {
  constructor(child) {
    this.child = child;
    this.buffer = "";
    this.pending = new Map();
    this.nextId = 1;
    this.stderr = "";
    child.stderr.on("data", (b) => { this.stderr += b.toString("utf8"); });
    child.stdout.on("data", (b) => this._onData(b));
  }
  _onData(buf) {
    this.buffer += buf.toString("utf8");
    let nl;
    while ((nl = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`MCP error: ${JSON.stringify(msg.error)}`));
        else resolve(msg.result);
      }
    }
  }
  request(method, params, timeoutMs = 5_000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP '${method}' timed out\nstderr:\n${this.stderr}`));
        }
      }, timeoutMs);
    });
  }
  notify(method, params) {
    this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }
  async close() {
    this.child.stdin.end();
    await new Promise((resolve) => {
      this.child.once("close", resolve);
      setTimeout(() => { try { this.child.kill("SIGTERM"); } catch {} resolve(); }, 2_000);
    });
  }
}

async function spawnChannel(home, port) {
  mkdirSync(join(home, ".foxcode"), { recursive: true, mode: 0o700 });
  writeFileSync(join(home, ".foxcode", "password"), TEST_PASSWORD);
  chmodSync(join(home, ".foxcode", "password"), 0o600);
  const child = spawn(process.execPath, [CHANNEL_SERVER], {
    env: { ...process.env, HOME: home, FOXCODE_PORT: String(port) },
    stdio: ["pipe", "pipe", "pipe"],
  });
  return new StdioMcpClient(child);
}

function connectFakeExtension(port) {
  return new Promise((resolve, reject) => {
    const ws = new WSImpl(`ws://127.0.0.1:${port}/?token=${TEST_PASSWORD}`);
    const t = setTimeout(() => {
      ws.removeAllListeners();
      reject(new Error("Fake extension WebSocket connect timeout"));
    }, 5_000);
    ws.once("open", () => { clearTimeout(t); resolve(ws); });
    ws.once("error", (err) => { clearTimeout(t); reject(err); });
  });
}

async function initMcp(client) {
  await client.request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "acceptance-test", version: "0.0.0" },
  });
  client.notify("notifications/initialized");
}

test("evalInBrowser round-trips through channel to fake extension and back", async () => {
  await withTmp(async (tmp) => {
    const home = join(tmp, "home");
    mkdirSync(home, { recursive: true });
    const port = await findFreePort();
    const mcp = await spawnChannel(home, port);
    let ws;
    try {
      await initMcp(mcp);
      ws = await connectFakeExtension(port);

      // Wire the fake extension. Channel WebSocket protocol (see documents/design.md §5):
      //   server -> ext: { type: 'tool_request', request_id, tool: 'EVAL_CODE', params: { code, timeout } }
      //   ext -> server: { type: 'tool_response', request_id, content: <any> }
      // Channel JSON.stringifies `content` and returns it as the MCP tools/call text result.
      ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString("utf8"));
        if (msg.type === "tool_request" && msg.tool === "EVAL_CODE") {
          ws.send(JSON.stringify({
            type: "tool_response",
            request_id: msg.request_id,
            content: { echoed: msg.params.code },
          }));
        }
      });

      // Allow the channel to register the connection (one tick).
      await new Promise((r) => setTimeout(r, 100));

      const result = await mcp.request("tools/call", {
        name: "evalInBrowser",
        arguments: { code: "return 42" },
      }, 8_000);
      assert.ok(Array.isArray(result.content), "tools/call must return content array");
      const text = result.content.find((c) => c.type === "text")?.text;
      assert.ok(text, "evalInBrowser response must include text content");
      // Channel serialises result as JSON; we confirm the echo round-tripped.
      assert.match(text, /echoed/);
      assert.match(text, /return 42/);
    } finally {
      try { ws?.close(); } catch {}
      await mcp.close();
    }
  });
});

test("status reflects connectedClients=1 after fake extension connects", async () => {
  await withTmp(async (tmp) => {
    const home = join(tmp, "home");
    mkdirSync(home, { recursive: true });
    const port = await findFreePort();
    const mcp = await spawnChannel(home, port);
    let ws;
    try {
      await initMcp(mcp);
      ws = await connectFakeExtension(port);
      // Server registers connection asynchronously.
      await new Promise((r) => setTimeout(r, 100));
      const result = await mcp.request("tools/call", {
        name: "status",
        arguments: {},
      });
      const text = result.content.find((c) => c.type === "text")?.text;
      const parsed = JSON.parse(text);
      assert.equal(parsed.connectedClients, 1, "after fake-ext connect, status must report 1 client");
    } finally {
      try { ws?.close(); } catch {}
      await mcp.close();
    }
  });
});

test("WebSocket connection is rejected with wrong password (auth at upgrade)", async () => {
  await withTmp(async (tmp) => {
    const home = join(tmp, "home");
    mkdirSync(home, { recursive: true });
    const port = await findFreePort();
    const mcp = await spawnChannel(home, port);
    try {
      await initMcp(mcp);
      const err = await new Promise((resolve) => {
        const ws = new WSImpl(`ws://127.0.0.1:${port}/?token=WRONG`);
        ws.once("open", () => resolve(new Error("connect should not have succeeded")));
        ws.once("unexpected-response", (_req, res) => resolve({ status: res.statusCode }));
        ws.once("error", (e) => resolve(e));
        setTimeout(() => resolve(new Error("timeout")), 3_000);
      });
      // Either a 401 unexpected-response or an error — both prove auth gate works.
      assert.ok(err.status === 401 || /401|Unexpected|ECONNRESET/.test(String(err.message || err)));
    } finally {
      await mcp.close();
    }
  });
});
