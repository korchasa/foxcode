import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ensureChannelDeps } from "./lazy-install.mjs";

test("returns 'skipped' when node_modules already exists", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "fx-li-"));
  try {
    mkdirSync(join(tmp, "node_modules"), { recursive: true });
    writeFileSync(join(tmp, "package.json"), '{"name":"x"}');
    assert.equal(await ensureChannelDeps(tmp), "skipped");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("throws when channel dir lacks package.json", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "fx-li-"));
  try {
    await assert.rejects(ensureChannelDeps(tmp), /missing package\.json/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
