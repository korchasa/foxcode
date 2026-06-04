import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const CLI = new URL("../bin/foxcode-opencode.mjs", import.meta.url).pathname;

function sandbox() {
  const tmp = mkdtempSync(join(tmpdir(), "fx-cli-"));
  const home = join(tmp, "home");
  const xdg = join(home, ".config");
  const cwd = join(tmp, "project");
  mkdirSync(xdg, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  return { tmp, home, xdg, cwd };
}

function run(args, env, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], {
    env: { ...process.env, ...env },
    cwd,
    encoding: "utf8",
    timeout: 120_000,
  });
}

test("setup prints MCP snippet on first run, second run is idempotent", () => {
  const { tmp, home, xdg, cwd } = sandbox();
  try {
    const env = { HOME: home, XDG_CONFIG_HOME: xdg };
    const r1 = run(["setup"], env, cwd);
    assert.equal(r1.status, 0, r1.stderr);
    assert.match(r1.stdout, /skill foxcode-run-project-profile: created/);
    assert.match(r1.stdout, /skill foxcode-run-user-profile: created/);
    assert.match(r1.stdout, /Add the following to opencode\.json/);
    assert.ok(lstatSync(join(xdg, "opencode", "skills", "foxcode-run-project-profile")).isSymbolicLink());
    const r2 = run(["setup"], env, cwd);
    assert.equal(r2.status, 0, r2.stderr);
    assert.match(r2.stdout, /skill foxcode-run-project-profile: kept/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("setup --write-config patches project opencode.json", () => {
  const { tmp, home, xdg, cwd } = sandbox();
  try {
    writeFileSync(join(cwd, "opencode.json"), JSON.stringify({ model: "sonnet" }, null, 2));
    const env = { HOME: home, XDG_CONFIG_HOME: xdg };
    const r = run(["setup", "--write-config"], env, cwd);
    assert.equal(r.status, 0, r.stderr);
    const obj = JSON.parse(readFileSync(join(cwd, "opencode.json"), "utf8"));
    assert.equal(obj.model, "sonnet");
    assert.equal(obj.mcp.foxcode.command[0], "npx");
    assert.match(obj.mcp.foxcode.command[2], /^foxcode-channel@\d+\.\d+\.\d+/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("setup --write-config refuses opencode.json with comments", () => {
  const { tmp, home, xdg, cwd } = sandbox();
  try {
    writeFileSync(join(cwd, "opencode.json"), '// header\n{"model":"sonnet"}\n');
    const env = { HOME: home, XDG_CONFIG_HOME: xdg };
    const r = run(["setup", "--write-config"], env, cwd);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /JSONC comments/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("uninstall removes seeded symlinks", () => {
  const { tmp, home, xdg, cwd } = sandbox();
  try {
    const env = { HOME: home, XDG_CONFIG_HOME: xdg };
    run(["setup"], env, cwd);
    const r = run(["uninstall"], env, cwd);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!existsSync(join(xdg, "opencode", "skills", "foxcode-run-project-profile")));
    // The handoff file path was retired under the npx-channel model.
    assert.ok(!existsSync(join(home, ".foxcode", "opencode-plugin-dir")));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("doctor reports state and exits 0 on healthy env", () => {
  const { tmp, home, xdg, cwd } = sandbox();
  try {
    const env = { HOME: home, XDG_CONFIG_HOME: xdg };
    const r = run(["doctor"], env, cwd);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Prereqs: ok/);
    assert.match(r.stdout, /Plugin root:/);
    assert.match(r.stdout, /Channel:\s+resolved via npx/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("unknown subcommand exits 2", () => {
  const r = run(["wat"], {}, process.cwd());
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Unknown command/);
});
