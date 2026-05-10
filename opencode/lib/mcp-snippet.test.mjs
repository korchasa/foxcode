import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildMcpSnippet, hasFoxcodeMcp, readJsonOrNull, findConfigWithFoxcode } from "./mcp-snippet.mjs";

test("buildMcpSnippet contains the absolute server path and node command", () => {
  const s = buildMcpSnippet("/abs/path/server.mjs");
  assert.match(s, /\/\/ Add to opencode\.json/);
  assert.match(s, /"command": \[\s*"node",\s*"\/abs\/path\/server\.mjs"\s*\]/);
  assert.match(s, /"type": "local"/);
  assert.match(s, /"FOXCODE_PROJECT_DIR": "\{env:PWD\}"/);
});

test("hasFoxcodeMcp detects mcp.foxcode key", () => {
  assert.equal(hasFoxcodeMcp({ mcp: { foxcode: { type: "local" } } }), true);
  assert.equal(hasFoxcodeMcp({ mcp: { other: {} } }), false);
  assert.equal(hasFoxcodeMcp({}), false);
  assert.equal(hasFoxcodeMcp(null), false);
});

test("readJsonOrNull returns null when file is missing", async () => {
  assert.equal(await readJsonOrNull("/nonexistent/path.json"), null);
});

test("readJsonOrNull throws on malformed JSON", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "fx-snippet-"));
  try {
    const p = join(tmp, "bad.json");
    writeFileSync(p, "{not valid");
    await assert.rejects(readJsonOrNull(p), /JSON/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("findConfigWithFoxcode returns first config that has the entry", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "fx-snippet-"));
  try {
    const a = join(tmp, "a.json");
    const b = join(tmp, "b.json");
    writeFileSync(a, JSON.stringify({ mcp: { other: {} } }));
    writeFileSync(b, JSON.stringify({ mcp: { foxcode: { type: "local" } } }));
    assert.equal(await findConfigWithFoxcode([a, b]), b);
    assert.equal(await findConfigWithFoxcode([a]), null);
    assert.equal(await findConfigWithFoxcode([join(tmp, "missing.json")]), null);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("findConfigWithFoxcode rethrows on parse error preserving original message", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "fx-snippet-"));
  try {
    const p = join(tmp, "bad.json");
    writeFileSync(p, "{");
    await assert.rejects(
      findConfigWithFoxcode([p]),
      (err) => err.message.includes("Cannot parse") && err.message.includes(p) && /JSON/.test(err.message),
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
