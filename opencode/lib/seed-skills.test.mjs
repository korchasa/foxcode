import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, readlinkSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { seedSkills } from "./seed-skills.mjs";

function makeBundle(root) {
  const skills = join(root, "bundle", "skills");
  for (const name of ["foxcode-run-project-profile", "foxcode-run-user-profile"]) {
    const dir = join(skills, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: x\n---\nbody\n`);
  }
  return skills;
}

test("first run creates symlinks for both skills", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "fx-seed-"));
  try {
    const bundleSkillsDir = makeBundle(tmp);
    const userSkillsDir = join(tmp, "user", "skills");
    const result = await seedSkills({ bundleSkillsDir, userSkillsDir });
    assert.deepEqual(Object.values(result).sort(), ["created", "created"]);
    for (const name of ["foxcode-run-project-profile", "foxcode-run-user-profile"]) {
      const link = join(userSkillsDir, name);
      assert.ok(lstatSync(link).isSymbolicLink());
      assert.equal(readlinkSync(link), join(bundleSkillsDir, name));
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("second run is a no-op (kept)", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "fx-seed-"));
  try {
    const bundleSkillsDir = makeBundle(tmp);
    const userSkillsDir = join(tmp, "user", "skills");
    await seedSkills({ bundleSkillsDir, userSkillsDir });
    const result = await seedSkills({ bundleSkillsDir, userSkillsDir });
    assert.deepEqual(Object.values(result).sort(), ["kept", "kept"]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("dangling symlink (wrong target) gets replaced", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "fx-seed-"));
  try {
    const bundleSkillsDir = makeBundle(tmp);
    const userSkillsDir = join(tmp, "user", "skills");
    mkdirSync(userSkillsDir, { recursive: true });
    symlinkSync("/nonexistent/old/path", join(userSkillsDir, "foxcode-run-project-profile"), "dir");
    symlinkSync("/nonexistent/old/path", join(userSkillsDir, "foxcode-run-user-profile"), "dir");
    const result = await seedSkills({ bundleSkillsDir, userSkillsDir });
    for (const name of ["foxcode-run-project-profile", "foxcode-run-user-profile"]) {
      assert.equal(result[name], "replaced-dangling");
      assert.equal(readlinkSync(join(userSkillsDir, name)), join(bundleSkillsDir, name));
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("real user directory is preserved (not overwritten)", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "fx-seed-"));
  try {
    const bundleSkillsDir = makeBundle(tmp);
    const userSkillsDir = join(tmp, "user", "skills");
    const userDir = join(userSkillsDir, "foxcode-run-project-profile");
    mkdirSync(userDir, { recursive: true });
    writeFileSync(join(userDir, "SKILL.md"), "USER CONTENT");
    const result = await seedSkills({ bundleSkillsDir, userSkillsDir });
    assert.equal(result["foxcode-run-project-profile"], "user-dir-kept");
    assert.ok(!lstatSync(userDir).isSymbolicLink());
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("missing bundled skill throws", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "fx-seed-"));
  try {
    const bundleSkillsDir = join(tmp, "bundle", "skills");
    mkdirSync(bundleSkillsDir, { recursive: true });
    const userSkillsDir = join(tmp, "user", "skills");
    await assert.rejects(
      seedSkills({ bundleSkillsDir, userSkillsDir }),
      /Bundled skill not found/,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
