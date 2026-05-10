import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { patchOpencodeJson } from "./patcher.mjs";

function tmp() {
  return mkdtempSync(join(tmpdir(), "fx-patch-"));
}

test("creates a new opencode.json when missing", async () => {
  const dir = tmp();
  try {
    const p = join(dir, "deep", "opencode.json");
    assert.equal(await patchOpencodeJson(p, "/abs/server.mjs"), "created");
    assert.ok(existsSync(p));
    const obj = JSON.parse(readFileSync(p, "utf8"));
    assert.equal(obj.mcp.foxcode.command[1], "/abs/server.mjs");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("adds mcp key when missing", async () => {
  const dir = tmp();
  try {
    const p = join(dir, "opencode.json");
    writeFileSync(p, JSON.stringify({ model: "sonnet" }, null, 2));
    assert.equal(await patchOpencodeJson(p, "/abs/server.mjs"), "added-mcp");
    const obj = JSON.parse(readFileSync(p, "utf8"));
    assert.equal(obj.model, "sonnet");
    assert.ok(obj.mcp.foxcode);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("adds mcp.foxcode when mcp exists but foxcode does not", async () => {
  const dir = tmp();
  try {
    const p = join(dir, "opencode.json");
    writeFileSync(p, JSON.stringify({ mcp: { other: { type: "local", command: ["x"] } } }, null, 2));
    assert.equal(await patchOpencodeJson(p, "/abs/server.mjs"), "added-foxcode");
    const obj = JSON.parse(readFileSync(p, "utf8"));
    assert.ok(obj.mcp.other);
    assert.ok(obj.mcp.foxcode);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("noop on second call with same path (idempotent)", async () => {
  const dir = tmp();
  try {
    const p = join(dir, "opencode.json");
    await patchOpencodeJson(p, "/abs/server.mjs");
    assert.equal(await patchOpencodeJson(p, "/abs/server.mjs"), "noop");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("updates command path when foxcode exists with different value", async () => {
  const dir = tmp();
  try {
    const p = join(dir, "opencode.json");
    await patchOpencodeJson(p, "/old/server.mjs");
    assert.equal(await patchOpencodeJson(p, "/new/server.mjs"), "updated");
    const obj = JSON.parse(readFileSync(p, "utf8"));
    assert.equal(obj.mcp.foxcode.command[1], "/new/server.mjs");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("refuses files with // comments", async () => {
  const dir = tmp();
  try {
    const p = join(dir, "opencode.json");
    writeFileSync(p, '// header\n{ "model": "sonnet" }\n');
    await assert.rejects(patchOpencodeJson(p, "/abs/server.mjs"), /JSONC comments/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("refuses files with /* */ comments", async () => {
  const dir = tmp();
  try {
    const p = join(dir, "opencode.json");
    writeFileSync(p, '/* header */\n{ "model": "sonnet" }\n');
    await assert.rejects(patchOpencodeJson(p, "/abs/server.mjs"), /JSONC comments/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("refuses non-object top-level shape", async () => {
  const dir = tmp();
  try {
    const p = join(dir, "opencode.json");
    writeFileSync(p, "[]");
    await assert.rejects(patchOpencodeJson(p, "/abs/server.mjs"), /not an object/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("refuses invalid JSON", async () => {
  const dir = tmp();
  try {
    const p = join(dir, "opencode.json");
    writeFileSync(p, "{ not valid");
    await assert.rejects(patchOpencodeJson(p, "/abs/server.mjs"), /invalid JSON/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
