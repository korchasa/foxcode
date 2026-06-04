/**
 * Acceptance: channel MCP server speaks JSON-RPC 2.0 over stdio and exposes
 * the documented foxcode tools (`status`, `evalInBrowser`).
 *
 * Validates the full chain "OpenCode plugin/CLI emits MCP entry → user
 * starts MCP server" without requiring OpenCode itself: anything that
 * speaks vanilla MCP-stdio (Claude Code, OpenCode, inspector, custom
 * client) sees the same protocol response.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";

import { withTmp, findFreePort } from "../../lib/test-helpers.mjs";

const CHANNEL_SERVER = new URL("../../../foxcode/channel/server.mjs", import.meta.url).pathname;

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

  request(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP request '${method}' timed out\nstderr:\n${this.stderr}`));
        }
      }, 5_000);
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
  writeFileSync(join(home, ".foxcode", "password"), "test-password-1234");
  chmodSync(join(home, ".foxcode", "password"), 0o600);
  const child = spawn(process.execPath, [CHANNEL_SERVER], {
    env: { ...process.env, HOME: home, FOXCODE_PORT: String(port) },
    stdio: ["pipe", "pipe", "pipe"],
  });
  return new StdioMcpClient(child);
}

test("channel responds to MCP initialize handshake", async () => {
  await withTmp(async (tmp) => {
    const home = join(tmp, "home");
    mkdirSync(home, { recursive: true });
    const client = await spawnChannel(home, await findFreePort());
    try {
      const result = await client.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "acceptance-test", version: "0.0.0" },
      });
      assert.ok(result.protocolVersion, "initialize must echo protocolVersion");
      assert.ok(result.capabilities, "initialize must announce capabilities");
      assert.ok(result.serverInfo?.name, "initialize must include serverInfo.name");
    } finally {
      await client.close();
    }
  });
});

test("channel exposes status, launchBrowser, evalInBrowser tools after initialization", async () => {
  await withTmp(async (tmp) => {
    const home = join(tmp, "home");
    mkdirSync(home, { recursive: true });
    const client = await spawnChannel(home, await findFreePort());
    try {
      await client.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "acceptance-test", version: "0.0.0" },
      });
      client.notify("notifications/initialized");
      const result = await client.request("tools/list", {});
      assert.ok(Array.isArray(result.tools), "tools/list must return tools array");
      const names = result.tools.map((t) => t.name).sort();
      assert.deepEqual(names, ["evalInBrowser", "launchBrowser", "status"]);
      const evalTool = result.tools.find((t) => t.name === "evalInBrowser");
      assert.ok(evalTool.inputSchema, "evalInBrowser must declare inputSchema");
      assert.ok(evalTool.inputSchema.properties.code, "evalInBrowser must accept `code` param");
      const launchTool = result.tools.find((t) => t.name === "launchBrowser");
      assert.ok(launchTool, "tools/list must include launchBrowser");
      assert.ok(launchTool.inputSchema.properties.timeout, "launchBrowser must accept timeout");
    } finally {
      await client.close();
    }
  });
});

test("channel status tool returns telemetry without browser connection", async () => {
  await withTmp(async (tmp) => {
    const home = join(tmp, "home");
    mkdirSync(home, { recursive: true });
    const port = await findFreePort();
    const client = await spawnChannel(home, port);
    try {
      await client.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "acceptance-test", version: "0.0.0" },
      });
      client.notify("notifications/initialized");
      const result = await client.request("tools/call", {
        name: "status",
        arguments: {},
      });
      assert.ok(Array.isArray(result.content), "tool/call must return content array");
      const text = result.content.find((c) => c.type === "text")?.text;
      assert.ok(text, "status response must include text content");
      const parsed = JSON.parse(text);
      assert.equal(parsed.port, port, "status must echo bound port");
      assert.equal(parsed.connectedClients, 0, "no extension connected → 0 clients");
      assert.ok(typeof parsed.uptime === "number", "uptime must be numeric");
    } finally {
      await client.close();
    }
  });
});
