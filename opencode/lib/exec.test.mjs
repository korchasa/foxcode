import { test } from "node:test";
import assert from "node:assert/strict";

import { exec } from "./exec.mjs";

test("exec captures stdout and exit code 0", async () => {
  const r = await exec(process.execPath, ["-e", "process.stdout.write('hello')"]);
  assert.equal(r.code, 0);
  assert.equal(r.signal, null);
  assert.equal(r.stdout, "hello");
  assert.equal(r.stderr, "");
});

test("exec captures stderr and non-zero exit", async () => {
  const r = await exec(process.execPath, ["-e", "process.stderr.write('boom'); process.exit(2)"]);
  assert.equal(r.code, 2);
  assert.equal(r.signal, null);
  assert.equal(r.stderr, "boom");
});

test("exec rejects when binary does not exist", async () => {
  await assert.rejects(exec("/nonexistent/binary-zzz", []));
});
