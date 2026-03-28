import { assertEquals } from "jsr:@std/assert";
import { join } from "jsr:@std/path";
import { validateCommand } from "./validate_command.ts";
import { initCommand } from "./init_command.ts";

// ---------------------------------------------------------------------------
// Helper: create a temp command dir with a given SKILL.md content
// ---------------------------------------------------------------------------

async function withTempDir(
  fn: (dir: string) => void | Promise<void>,
): Promise<void> {
  const dir = await Deno.makeTempDir();
  try {
    await fn(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

async function writeSkillMd(dir: string, content: string): Promise<void> {
  await Deno.writeTextFile(join(dir, "SKILL.md"), content);
}

// ===========================================================================
// validateCommand
// ===========================================================================

Deno.test("validate: valid command with name and description", async () => {
  await withTempDir(async (dir) => {
    await writeSkillMd(
      dir,
      "---\nname: flowai-test-cmd\ndescription: A valid test command\n---\n# Title\n",
    );
    const [valid, msg] = validateCommand(dir);
    assertEquals(valid, true);
    assertEquals(msg, "Command is valid!");
  });
});

Deno.test("validate: missing SKILL.md returns error", async () => {
  await withTempDir((dir) => {
    const [valid, msg] = validateCommand(dir);
    assertEquals(valid, false);
    assertEquals(msg, "SKILL.md not found");
  });
});

Deno.test("validate: no frontmatter (no ---) returns error", async () => {
  await withTempDir(async (dir) => {
    await writeSkillMd(dir, "# Just markdown, no frontmatter\n");
    const [valid, msg] = validateCommand(dir);
    assertEquals(valid, false);
    assertEquals(msg, "No YAML frontmatter found");
  });
});

Deno.test("validate: invalid YAML in frontmatter returns error", async () => {
  await withTempDir(async (dir) => {
    await writeSkillMd(dir, "---\n: :\n  bad:\n    - [unterminated\n---\n");
    const [valid, msg] = validateCommand(dir);
    assertEquals(valid, false);
    assertEquals(msg.startsWith("Invalid YAML in frontmatter:"), true);
  });
});

Deno.test("validate: missing name field returns error", async () => {
  await withTempDir(async (dir) => {
    await writeSkillMd(dir, "---\ndescription: something\n---\n");
    const [valid, msg] = validateCommand(dir);
    assertEquals(valid, false);
    assertEquals(msg, "Missing 'name' in frontmatter");
  });
});

Deno.test("validate: missing description field returns error", async () => {
  await withTempDir(async (dir) => {
    await writeSkillMd(dir, "---\nname: flowai-test\n---\n");
    const [valid, msg] = validateCommand(dir);
    assertEquals(valid, false);
    assertEquals(msg, "Missing 'description' in frontmatter");
  });
});

Deno.test("validate: unexpected frontmatter key returns error listing allowed keys", async () => {
  await withTempDir(async (dir) => {
    await writeSkillMd(
      dir,
      "---\nname: flowai-test\ndescription: ok\nauthor: someone\n---\n",
    );
    const [valid, msg] = validateCommand(dir);
    assertEquals(valid, false);
    assertEquals(msg.includes("Unexpected key(s)"), true);
    assertEquals(msg.includes("author"), true);
    assertEquals(msg.includes("Allowed properties are:"), true);
  });
});

Deno.test("validate: name with uppercase returns error", async () => {
  await withTempDir(async (dir) => {
    await writeSkillMd(
      dir,
      "---\nname: flowai-Test\ndescription: A command\n---\n",
    );
    const [valid, msg] = validateCommand(dir);
    assertEquals(valid, false);
    assertEquals(msg.includes("hyphen-case"), true);
  });
});

Deno.test("validate: name starting with hyphen returns error", async () => {
  await withTempDir(async (dir) => {
    await writeSkillMd(
      dir,
      "---\nname: -flowai-test\ndescription: A command\n---\n",
    );
    const [valid, msg] = validateCommand(dir);
    assertEquals(valid, false);
    assertEquals(msg.includes("cannot start/end with hyphen"), true);
  });
});

Deno.test("validate: name with consecutive hyphens returns error", async () => {
  await withTempDir(async (dir) => {
    await writeSkillMd(
      dir,
      "---\nname: flowai--test\ndescription: A command\n---\n",
    );
    const [valid, msg] = validateCommand(dir);
    assertEquals(valid, false);
    assertEquals(msg.includes("consecutive hyphens"), true);
  });
});

Deno.test("validate: name too long (>64 chars) returns error", async () => {
  await withTempDir(async (dir) => {
    const longName = "a" + "-abcd".repeat(16); // 65 chars
    await writeSkillMd(
      dir,
      `---\nname: ${longName}\ndescription: A command\n---\n`,
    );
    const [valid, msg] = validateCommand(dir);
    assertEquals(valid, false);
    assertEquals(msg.includes("too long"), true);
    assertEquals(msg.includes("Maximum is 64"), true);
  });
});

Deno.test("validate: description with angle brackets returns error", async () => {
  await withTempDir(async (dir) => {
    await writeSkillMd(
      dir,
      "---\nname: flowai-test\ndescription: Use <html> tags\n---\n",
    );
    const [valid, msg] = validateCommand(dir);
    assertEquals(valid, false);
    assertEquals(msg.includes("angle brackets"), true);
  });
});

Deno.test("validate: description too long (>1024 chars) returns error", async () => {
  await withTempDir(async (dir) => {
    const longDesc = "x".repeat(1025);
    await writeSkillMd(
      dir,
      `---\nname: flowai-test\ndescription: ${longDesc}\n---\n`,
    );
    const [valid, msg] = validateCommand(dir);
    assertEquals(valid, false);
    assertEquals(msg.includes("too long"), true);
    assertEquals(msg.includes("Maximum is 1024"), true);
  });
});

// ===========================================================================
// initCommand
// ===========================================================================

Deno.test("init: creates directory with SKILL.md and resource dirs", async () => {
  await withTempDir(async (parentDir) => {
    const result = initCommand("flowai-new-cmd", parentDir);
    assertEquals(typeof result, "string");
    assertEquals(result !== null, true);

    const cmdDir = join(parentDir, "flowai-new-cmd");

    // SKILL.md exists
    const skillStat = await Deno.stat(join(cmdDir, "SKILL.md"));
    assertEquals(skillStat.isFile, true);

    // Resource directories exist
    const scriptsStat = await Deno.stat(join(cmdDir, "scripts"));
    assertEquals(scriptsStat.isDirectory, true);

    const refStat = await Deno.stat(join(cmdDir, "references"));
    assertEquals(refStat.isDirectory, true);

    const assetsStat = await Deno.stat(join(cmdDir, "assets"));
    assertEquals(assetsStat.isDirectory, true);
  });
});

Deno.test("init: fails if directory already exists", async () => {
  await withTempDir(async (parentDir) => {
    // Pre-create the directory
    await Deno.mkdir(join(parentDir, "flowai-existing"), { recursive: true });

    const result = initCommand("flowai-existing", parentDir);
    assertEquals(result, null);
  });
});

Deno.test("init: SKILL.md contains correct name in frontmatter", async () => {
  await withTempDir(async (parentDir) => {
    initCommand("flowai-abc-test", parentDir);

    const content = await Deno.readTextFile(
      join(parentDir, "flowai-abc-test", "SKILL.md"),
    );
    assertEquals(content.startsWith("---"), true);
    assertEquals(content.includes("name: flowai-abc-test"), true);
  });
});

Deno.test("init: template description is a YAML list placeholder requiring user edit", async () => {
  await withTempDir((parentDir) => {
    const cmdDir = initCommand("flowai-valid-init", parentDir);
    assertEquals(cmdDir !== null, true);

    // The template description is `[TODO: ...]` which YAML parses as a list,
    // intentionally failing validation until the user replaces it with a string.
    const [valid, msg] = validateCommand(cmdDir!);
    assertEquals(valid, false);
    assertEquals(msg, "Description must be a string, got list");
  });
});

Deno.test("init: --skip-existing returns path when directory exists", async () => {
  await withTempDir(async (parentDir) => {
    await Deno.mkdir(join(parentDir, "flowai-existing"), { recursive: true });

    const result = initCommand("flowai-existing", parentDir, {
      skipExisting: true,
    });
    assertEquals(typeof result, "string");
    assertEquals(result !== null, true);
  });
});

// ===========================================================================
// packageCommand — minimal (not exported, depends on `zip` CLI)
// ===========================================================================

Deno.test("package: validate_command is importable by package_command", async () => {
  // Smoke test: ensure the module can be imported without error.
  // packageCommand itself is not exported, so we verify the dependency chain.
  const mod = await import("./package_command.ts");
  // The module has no public exports; confirm it loaded without throwing.
  assertEquals(typeof mod, "object");
});
