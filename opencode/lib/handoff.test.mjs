import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeHandoff, readHandoff, clearHandoff } from "./handoff.mjs";

test("writeHandoff creates parent dir and persists path", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "fx-ho-"));
  try {
    const file = join(tmp, ".foxcode", "opencode-plugin-dir");
    await writeHandoff(file, "/abs/bundle");
    assert.ok(existsSync(file));
    assert.equal(await readHandoff(file), "/abs/bundle");
    if (process.platform !== "win32") {
      assert.equal(statSync(file).mode & 0o777, 0o644);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("readHandoff returns null when file missing", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "fx-ho-"));
  try {
    assert.equal(await readHandoff(join(tmp, "missing")), null);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("readHandoff returns null when file is empty/whitespace", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "fx-ho-"));
  try {
    const file = join(tmp, ".foxcode", "opencode-plugin-dir");
    await writeHandoff(file, "   ");
    assert.equal(await readHandoff(file), null);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("clearHandoff removes the file (idempotent)", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "fx-ho-"));
  try {
    const file = join(tmp, ".foxcode", "opencode-plugin-dir");
    await writeHandoff(file, "/x");
    await clearHandoff(file);
    assert.ok(!existsSync(file));
    await clearHandoff(file); // does not throw
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
