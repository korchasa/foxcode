import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseFrontmatter, parseSkillFile } from "./skill-frontmatter.mjs";

test("parseFrontmatter extracts name and description", () => {
  const fm = parseFrontmatter("---\nname: foo\ndescription: bar\n---\nbody");
  assert.equal(fm.name, "foo");
  assert.equal(fm.description, "bar");
});

test("parseFrontmatter ignores unrecognised top-level keys without failing", () => {
  const fm = parseFrontmatter(
    "---\nname: foo\ndescription: bar\nallowed-tools: [Bash]\n---\nbody",
  );
  assert.equal(fm.name, "foo");
  assert.equal(fm.description, "bar");
});

test("parseFrontmatter throws when name missing", () => {
  assert.throws(() => parseFrontmatter("---\ndescription: bar\n---\n"), /name/);
});

test("parseFrontmatter throws when description missing", () => {
  assert.throws(() => parseFrontmatter("---\nname: foo\n---\n"), /description/);
});

test("parseFrontmatter throws when frontmatter unterminated", () => {
  assert.throws(() => parseFrontmatter("---\nname: foo\ndescription: bar\n"), /Unterminated/);
});

test("parseFrontmatter throws when file does not start with ---", () => {
  assert.throws(() => parseFrontmatter("# Heading\n"), /Missing/);
});

test("parseSkillFile reads from disk", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "fx-fm-"));
  try {
    const p = join(tmp, "SKILL.md");
    writeFileSync(p, "---\nname: x\ndescription: y\n---\n");
    const fm = await parseSkillFile(p);
    assert.equal(fm.name, "x");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("real bundled skills (project + user profile) parse cleanly", async () => {
  // This guards against accidental frontmatter shape regressions in
  // foxcode/skills/foxcode-run-{project,user}-profile/SKILL.md.
  // Path resolved relative to this test file: ../../foxcode/skills/...
  const repoRoot = new URL("../../", import.meta.url).pathname;
  for (const name of ["foxcode-run-project-profile", "foxcode-run-user-profile"]) {
    const p = join(repoRoot, "foxcode", "skills", name, "SKILL.md");
    const fm = await parseSkillFile(p);
    assert.equal(fm.name, name);
    assert.ok(fm.description && fm.description.length > 0);
  }
});

test("real Codex wrapper skills parse cleanly", async () => {
  const repoRoot = new URL("../../", import.meta.url).pathname;
  for (const name of ["foxcode-run-project-profile", "foxcode-run-user-profile"]) {
    const p = join(repoRoot, ".agents", "skills", name, "SKILL.md");
    const fm = await parseSkillFile(p);
    assert.equal(fm.name, name);
    assert.ok(fm.description && fm.description.length > 0);
  }
});
