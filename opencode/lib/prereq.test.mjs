import { test } from "node:test";
import assert from "node:assert/strict";

import { checkPrereqs } from "./prereq.mjs";

test("checkPrereqs returns ok=true on a Node>=18+npm dev environment", async () => {
  const r = await checkPrereqs();
  // We expect this test to be run inside a Node 18+ env with npm available.
  assert.equal(r.ok, true, `problems: ${r.problems.join(", ")}`);
  assert.deepEqual(r.problems, []);
});
