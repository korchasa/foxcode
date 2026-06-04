import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { withTmp } from "../lib/test-helpers.mjs";

const HERE = new URL("..", import.meta.url).pathname;

test("prepack assembles bundle/skills only; extension and channel/ are NOT bundled (npx)", async () => {
  await withTmp(async (tmp) => {
    const out = join(tmp, "bundle");
    const r = spawnSync(process.execPath, [join(HERE, "prepack.mjs"), `--out=${out}`], {
      cwd: HERE,
      encoding: "utf8",
      timeout: 60_000,
    });
    assert.equal(r.status, 0, `prepack failed: ${r.stderr || r.stdout}`);
    assert.ok(existsSync(join(out, "skills", "foxcode-run-project-profile", "SKILL.md")));
    assert.ok(existsSync(join(out, "skills", "foxcode-run-user-profile", "SKILL.md")));
    // Both the Firefox extension and the channel runtime are resolved via npx
    // (the foxcode-channel npm package bundles the extension). The OpenCode
    // bundle must not duplicate them.
    assert.ok(
      !existsSync(join(out, "channel")),
      `bundle/channel/ still emitted by prepack — npx model makes this dead weight`,
    );
    assert.ok(
      !existsSync(join(out, "extension")),
      `bundle/extension/ still emitted by prepack — extension now ships inside foxcode-channel`,
    );
    const pluginPkg = JSON.parse(readFileSync(join(HERE, "..", "foxcode", ".claude-plugin", "plugin.json"), "utf8"));
    const opencodePkg = JSON.parse(readFileSync(join(HERE, "package.json"), "utf8"));
    assert.equal(opencodePkg.version, pluginPkg.version);
  });
});
