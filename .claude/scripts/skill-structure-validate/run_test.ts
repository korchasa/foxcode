import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { isSkillMd, validate } from "./run.ts";

// --- isSkillMd ---

Deno.test("isSkillMd: valid skill path returns true", () => {
  assertEquals(isSkillMd("/foo/skills/bar/SKILL.md"), true);
});

Deno.test("isSkillMd: root SKILL.md without skills/ parent returns false", () => {
  assertEquals(isSkillMd("/foo/SKILL.md"), false);
});

Deno.test("isSkillMd: README.md in skills/ returns false", () => {
  assertEquals(isSkillMd("/foo/skills/bar/README.md"), false);
});

Deno.test("isSkillMd: nested skills path returns true", () => {
  assertEquals(isSkillMd("/a/b/skills/my-skill/SKILL.md"), true);
});

Deno.test("isSkillMd: empty string returns false", () => {
  assertEquals(isSkillMd(""), false);
});

// --- validate (using inline validateSkill) ---

Deno.test("validate: SKILL.md without frontmatter returns error", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(
      `${tmpDir}/SKILL.md`,
      "# My Skill\nNo frontmatter here.\n",
    );
    const result = await validate(tmpDir);
    if (result !== null) {
      assertStringIncludes(result, "frontmatter");
    }
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("validate: valid SKILL.md returns null", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(
      `${tmpDir}/SKILL.md`,
      `---
name: test-skill
description: A test skill
version: 1.0.0
---

# Test Skill

## Instructions

Do something.
`,
    );
    const result = await validate(tmpDir);
    assertEquals(result, null);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("validate: non-existent dir returns error", async () => {
  const result = await validate("/tmp/non-existent-skill-dir-12345");
  if (result !== null) {
    assertStringIncludes(result, "not found");
  }
});

// --- Integration ---

Deno.test("integration: non-SKILL.md file produces no output", async () => {
  const input = JSON.stringify({
    tool_name: "Write",
    tool_input: { file_path: "/tmp/readme.md", content: "hello" },
  });
  const cmd = new Deno.Command("deno", {
    args: [
      "run",
      "-A",
      "--no-config",
      new URL("./run.ts", import.meta.url).pathname,
    ],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });
  const child = cmd.spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(input));
  await writer.close();
  const { stdout, code } = await child.output();
  assertEquals(code, 0);
  assertEquals(new TextDecoder().decode(stdout).trim(), "");
});
