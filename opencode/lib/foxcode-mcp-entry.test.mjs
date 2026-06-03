// Phase 3 acceptance: the OpenCode MCP entry shape is the unified
// npx form (matching CC/Codex), with no bundled-channel reference.
// Lockstep with foxcode/channel/package.json so a channel SemVer bump
// without a corresponding entry pin bump fails the build.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { buildFoxcodeMcpEntry, CHANNEL_SPEC } from "./foxcode-mcp-entry.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const channelPkgPath = resolve(here, "../../foxcode/channel/package.json");
const channelPkg = JSON.parse(readFileSync(channelPkgPath, "utf8"));

test("foxcode-mcp-entry: CHANNEL_SPEC matches channel package.json (lockstep)", () => {
  assert.equal(
    CHANNEL_SPEC,
    `foxcode-channel@${channelPkg.version}`,
    `CHANNEL_SPEC drift — must equal foxcode-channel@${channelPkg.version}`,
  );
});

test("foxcode-mcp-entry: command is `npx -y <CHANNEL_SPEC>` — no node, no abs path", () => {
  const entry = buildFoxcodeMcpEntry();
  assert.equal(entry.type, "local");
  assert.deepEqual(entry.command, ["npx", "-y", CHANNEL_SPEC]);
  assert.equal(entry.enabled, true);
});

test("foxcode-mcp-entry: environment still carries FOXCODE_PROJECT_DIR={env:PWD}", () => {
  // OpenCode-specific {env:VAR} interpolation. Defensive override so
  // OpenCode hosts that drop cwd still get the user's project dir.
  const entry = buildFoxcodeMcpEntry();
  assert.deepEqual(entry.environment, { FOXCODE_PROJECT_DIR: "{env:PWD}" });
});

test("foxcode-mcp-entry: no `cwd` field (consistent with CC/Codex npx snippets)", () => {
  const entry = buildFoxcodeMcpEntry();
  assert.equal(Object.prototype.hasOwnProperty.call(entry, "cwd"), false);
});
