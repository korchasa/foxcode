import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import FoxCodeOpencodePlugin, { __test } from "../index.mjs";
import { handoffFilePath, userSkillsDir } from "../lib/paths.mjs";
import { withTmp, withEnv, captureStderr } from "../lib/test-helpers.mjs";

async function inPluginSandbox(tmp, fn) {
  const home = join(tmp, "home");
  const xdg = join(home, ".config");
  const project = join(tmp, "project");
  mkdirSync(xdg, { recursive: true });
  mkdirSync(project, { recursive: true });
  await withEnv({ HOME: home, XDG_CONFIG_HOME: xdg }, async () => {
    const origCwd = process.cwd();
    process.chdir(project);
    try {
      await fn({ home, xdg, project });
    } finally {
      process.chdir(origCwd);
    }
  });
}

test("bootstrap seeds skills, writes handoff, and emits snippet when mcp absent", async () => {
  await withTmp(async (tmp) => {
    await inPluginSandbox(tmp, async () => {
      const captured = await captureStderr(async () => {
        await __test.bootstrap();
      });
      for (const name of ["foxcode-run-project-profile", "foxcode-run-user-profile"]) {
        assert.ok(existsSync(join(userSkillsDir(), name)), `skill not seeded: ${name}`);
      }
      const ho = handoffFilePath();
      assert.ok(existsSync(ho));
      const handoffContent = readFileSync(ho, "utf8").trim();
      assert.ok(handoffContent.endsWith("/opencode") || handoffContent.endsWith("\\opencode"));
      assert.match(captured, /Add the snippet below/);
      assert.match(captured, /"mcp"/);
      assert.match(captured, /"foxcode"/);
    });
  });
});

test("bootstrap stays quiet when project opencode.json already has mcp.foxcode", async () => {
  await withTmp(async (tmp) => {
    await inPluginSandbox(tmp, async ({ project }) => {
      writeFileSync(
        join(project, "opencode.json"),
        JSON.stringify({ mcp: { foxcode: { type: "local", command: ["x"] } } }),
      );
      const captured = await captureStderr(async () => {
        await __test.bootstrap();
      });
      assert.doesNotMatch(captured, /Add the snippet below/);
    });
  });
});

test("default export returns hook map with session.created handler", async () => {
  const hooks = await FoxCodeOpencodePlugin({});
  assert.equal(typeof hooks["session.created"], "function");
});
