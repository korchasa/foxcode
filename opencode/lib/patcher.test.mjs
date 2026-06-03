import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { patchOpencodeJson } from "./patcher.mjs";
import { CHANNEL_SPEC } from "./foxcode-mcp-entry.mjs";

function tmp() {
  return mkdtempSync(join(tmpdir(), "fx-patch-"));
}

test("creates a new opencode.json when missing", async () => {
  const dir = tmp();
  try {
    const p = join(dir, "deep", "opencode.json");
    assert.equal(await patchOpencodeJson(p), "created");
    assert.ok(existsSync(p));
    const obj = JSON.parse(readFileSync(p, "utf8"));
    assert.deepEqual(obj.mcp.foxcode.command, ["npx", "-y", CHANNEL_SPEC]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("adds mcp key when missing", async () => {
  const dir = tmp();
  try {
    const p = join(dir, "opencode.json");
    writeFileSync(p, JSON.stringify({ model: "sonnet" }, null, 2));
    assert.equal(await patchOpencodeJson(p), "added-mcp");
    const obj = JSON.parse(readFileSync(p, "utf8"));
    assert.equal(obj.model, "sonnet");
    assert.ok(obj.mcp.foxcode);
    assert.deepEqual(obj.mcp.foxcode.command, ["npx", "-y", CHANNEL_SPEC]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("adds mcp.foxcode when mcp exists but foxcode does not", async () => {
  const dir = tmp();
  try {
    const p = join(dir, "opencode.json");
    writeFileSync(p, JSON.stringify({ mcp: { other: { type: "local", command: ["x"] } } }, null, 2));
    assert.equal(await patchOpencodeJson(p), "added-foxcode");
    const obj = JSON.parse(readFileSync(p, "utf8"));
    assert.ok(obj.mcp.other);
    assert.ok(obj.mcp.foxcode);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("noop on second call with same pin (idempotent)", async () => {
  const dir = tmp();
  try {
    const p = join(dir, "opencode.json");
    await patchOpencodeJson(p);
    assert.equal(await patchOpencodeJson(p), "noop");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("updates the entry when an older shape is on disk", async () => {
  const dir = tmp();
  try {
    const p = join(dir, "opencode.json");
    // Pre-existing legacy entry (node + abs path). patch must rewrite.
    writeFileSync(p, JSON.stringify({
      mcp: {
        foxcode: { type: "local", command: ["node", "/old/server.mjs"], enabled: true },
      },
    }, null, 2));
    assert.equal(await patchOpencodeJson(p), "updated");
    const obj = JSON.parse(readFileSync(p, "utf8"));
    assert.deepEqual(obj.mcp.foxcode.command, ["npx", "-y", CHANNEL_SPEC]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("refuses files with // comments", async () => {
  const dir = tmp();
  try {
    const p = join(dir, "opencode.json");
    writeFileSync(p, '// header\n{ "model": "sonnet" }\n');
    await assert.rejects(patchOpencodeJson(p), /JSONC comments/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("refuses files with /* */ comments", async () => {
  const dir = tmp();
  try {
    const p = join(dir, "opencode.json");
    writeFileSync(p, '/* header */\n{ "model": "sonnet" }\n');
    await assert.rejects(patchOpencodeJson(p), /JSONC comments/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("refuses non-object top-level shape", async () => {
  const dir = tmp();
  try {
    const p = join(dir, "opencode.json");
    writeFileSync(p, "[]");
    await assert.rejects(patchOpencodeJson(p), /not an object/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("refuses invalid JSON", async () => {
  const dir = tmp();
  try {
    const p = join(dir, "opencode.json");
    writeFileSync(p, "{ not valid");
    await assert.rejects(patchOpencodeJson(p), /invalid JSON/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
