import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { runSetup } from "./setup.mjs";
import { withTmp, withEnv } from "./test-helpers.mjs";

const PLUGIN_ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

test("runSetup seeds skills, writes handoff, returns configFound=null when mcp absent", async () => {
  await withTmp(async (tmp) => {
    const project = join(tmp, "project");
    mkdirSync(project, { recursive: true });
    await withEnv({ HOME: join(tmp, "home"), XDG_CONFIG_HOME: join(tmp, "home", ".config") }, async () => {
      const r = await runSetup({ pluginRoot: PLUGIN_ROOT, project, writeConfig: false });
      assert.equal(r.prereq.ok, true);
      assert.deepEqual(Object.values(r.skills).sort(), ["created", "created"]);
      assert.equal(r.configFound, null);
      assert.equal(r.configAction, null);
      assert.ok(existsSync(r.handoff));
    });
  });
});

test("runSetup with writeConfig=true patches project opencode.json", async () => {
  await withTmp(async (tmp) => {
    const project = join(tmp, "project");
    mkdirSync(project, { recursive: true });
    writeFileSync(join(project, "opencode.json"), JSON.stringify({ model: "sonnet" }, null, 2));
    await withEnv({ HOME: join(tmp, "home"), XDG_CONFIG_HOME: join(tmp, "home", ".config") }, async () => {
      const r = await runSetup({ pluginRoot: PLUGIN_ROOT, project, writeConfig: true });
      assert.equal(r.configAction, "added-mcp");
      assert.equal(r.configTarget, join(project, "opencode.json"));
      const obj = JSON.parse(readFileSync(join(project, "opencode.json"), "utf8"));
      assert.equal(obj.mcp.foxcode.command[0], "npx");
      assert.match(obj.mcp.foxcode.command[2], /^foxcode-channel@\d+\.\d+\.\d+/);
    });
  });
});

test("runSetup is idempotent across repeated calls", async () => {
  await withTmp(async (tmp) => {
    const project = join(tmp, "project");
    mkdirSync(project, { recursive: true });
    await withEnv({ HOME: join(tmp, "home"), XDG_CONFIG_HOME: join(tmp, "home", ".config") }, async () => {
      await runSetup({ pluginRoot: PLUGIN_ROOT, project, writeConfig: false });
      const r2 = await runSetup({ pluginRoot: PLUGIN_ROOT, project, writeConfig: false });
      assert.deepEqual(Object.values(r2.skills).sort(), ["kept", "kept"]);
    });
  });
});
