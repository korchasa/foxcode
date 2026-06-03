import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { resolveFromModule, bundlePaths, userSkillsDir, handoffFilePath, userOpencodeJson } from "./paths.mjs";
import { withTmp, withEnv } from "./test-helpers.mjs";

test("resolveFromModule resolves '.' to plugin root when caller is index-adjacent", async () => {
  await withTmp(async (tmp) => {
    const root = join(tmp, "pkg");
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "package.json"), '{"name":"x"}');
    writeFileSync(join(root, "index.mjs"), "");
    const callerFile = join(root, "index.mjs");
    assert.equal(resolveFromModule(pathToFileURL(callerFile).href, "."), root);
  });
});

test("resolveFromModule resolves '..' from a lib/ child", async () => {
  await withTmp(async (tmp) => {
    const root = join(tmp, "pkg");
    const lib = join(root, "lib");
    mkdirSync(lib, { recursive: true });
    writeFileSync(join(root, "package.json"), '{"name":"x"}');
    writeFileSync(join(root, "index.mjs"), "");
    const callerFile = join(lib, "thing.mjs");
    writeFileSync(callerFile, "");
    assert.equal(resolveFromModule(pathToFileURL(callerFile).href, ".."), root);
  });
});

test("resolveFromModule throws when target dir lacks package.json or index.mjs", async () => {
  await withTmp(async (tmp) => {
    const callerFile = join(tmp, "x.mjs");
    writeFileSync(callerFile, "");
    assert.throws(
      () => resolveFromModule(pathToFileURL(callerFile).href, "."),
      /Plugin root malformed/,
    );
  });
});

test("bundlePaths returns bundle/* when ./bundle/ exists", async () => {
  await withTmp(async (tmp) => {
    mkdirSync(join(tmp, "bundle"), { recursive: true });
    const p = bundlePaths(tmp);
    assert.equal(p.source, "bundle");
    assert.equal(p.extension, join(tmp, "bundle", "extension"));
  });
});

test("bundlePaths falls back to repo-relative paths in dev mode", async () => {
  await withTmp(async (tmp) => {
    const pluginRoot = join(tmp, "opencode");
    mkdirSync(pluginRoot, { recursive: true });
    const p = bundlePaths(pluginRoot);
    assert.equal(p.source, "dev");
    assert.equal(p.extension, join(tmp, "foxcode", "extension"));
    assert.equal(p.channel, join(tmp, "foxcode", "channel"));
    assert.equal(p.skills, join(tmp, "foxcode", "skills"));
  });
});

test("userSkillsDir respects XDG_CONFIG_HOME", async () => {
  await withEnv({ XDG_CONFIG_HOME: "/tmp/xdg-test" }, async () => {
    assert.equal(userSkillsDir(), "/tmp/xdg-test/opencode/skills");
  });
});

test("userSkillsDir falls back to ~/.config when XDG_CONFIG_HOME is unset", () => {
  const orig = process.env.XDG_CONFIG_HOME;
  delete process.env.XDG_CONFIG_HOME;
  try {
    assert.equal(userSkillsDir(), join(homedir(), ".config", "opencode", "skills"));
  } finally {
    if (orig === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = orig;
  }
});

test("handoffFilePath returns ~/.foxcode/opencode-plugin-dir", () => {
  assert.equal(handoffFilePath(), join(homedir(), ".foxcode", "opencode-plugin-dir"));
});

test("userOpencodeJson respects XDG_CONFIG_HOME", async () => {
  await withEnv({ XDG_CONFIG_HOME: "/tmp/xdg-test" }, async () => {
    assert.equal(userOpencodeJson(), "/tmp/xdg-test/opencode/opencode.json");
  });
});
