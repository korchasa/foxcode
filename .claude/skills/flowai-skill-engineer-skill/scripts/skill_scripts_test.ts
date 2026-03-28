import { assertEquals } from "jsr:@std/assert";
import { join } from "jsr:@std/path";
import { validateSkill } from "./validate_skill.ts";
import { initSkill, titleCaseName } from "./init_skill.ts";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Create a temp skill directory with a SKILL.md containing given content. */
async function makeSkillDir(skillMdContent: string): Promise<string> {
  const dir = await Deno.makeTempDir({ prefix: "skill_test_" });
  await Deno.writeTextFile(join(dir, "SKILL.md"), skillMdContent);
  return dir;
}

function validSkillMd(overrides?: { name?: string; description?: string }) {
  const name = overrides?.name ?? "my-skill";
  const desc = overrides?.description ?? "A valid test skill description";
  return `---\nname: ${name}\ndescription: ${desc}\n---\n\n# My Skill\n`;
}

// ---------------------------------------------------------------------------
// validateSkill tests
// ---------------------------------------------------------------------------

Deno.test("validate: valid skill directory", async () => {
  const dir = await makeSkillDir(validSkillMd());
  try {
    const [ok, msg] = validateSkill(dir);
    assertEquals(ok, true);
    assertEquals(msg, "Skill is valid!");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("validate: missing SKILL.md", async () => {
  const dir = await Deno.makeTempDir({ prefix: "skill_test_" });
  try {
    const [ok, msg] = validateSkill(dir);
    assertEquals(ok, false);
    assertEquals(msg, "SKILL.md not found");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("validate: no frontmatter", async () => {
  const dir = await makeSkillDir("# Just a heading\nNo frontmatter here.\n");
  try {
    const [ok, msg] = validateSkill(dir);
    assertEquals(ok, false);
    assertEquals(msg, "No YAML frontmatter found");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("validate: invalid YAML in frontmatter", async () => {
  const content = "---\nname: [\ninvalid yaml\n---\n";
  const dir = await makeSkillDir(content);
  try {
    const [ok, msg] = validateSkill(dir);
    assertEquals(ok, false);
    assertEquals(msg.startsWith("Invalid YAML in frontmatter:"), true);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("validate: missing name", async () => {
  const content = "---\ndescription: Some description\n---\n";
  const dir = await makeSkillDir(content);
  try {
    const [ok, msg] = validateSkill(dir);
    assertEquals(ok, false);
    assertEquals(msg, "Missing 'name' in frontmatter");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("validate: missing description", async () => {
  const content = "---\nname: my-skill\n---\n";
  const dir = await makeSkillDir(content);
  try {
    const [ok, msg] = validateSkill(dir);
    assertEquals(ok, false);
    assertEquals(msg, "Missing 'description' in frontmatter");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("validate: unexpected frontmatter key", async () => {
  const content =
    "---\nname: my-skill\ndescription: ok\nauthor: someone\n---\n";
  const dir = await makeSkillDir(content);
  try {
    const [ok, msg] = validateSkill(dir);
    assertEquals(ok, false);
    assertEquals(msg.includes("Unexpected key(s)"), true);
    assertEquals(msg.includes("author"), true);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("validate: name not kebab-case", async () => {
  const dir = await makeSkillDir(validSkillMd({ name: "MySkill" }));
  try {
    const [ok, msg] = validateSkill(dir);
    assertEquals(ok, false);
    assertEquals(msg.includes("hyphen-case"), true);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("validate: name starting with hyphen", async () => {
  const dir = await makeSkillDir(validSkillMd({ name: "-my-skill" }));
  try {
    const [ok, msg] = validateSkill(dir);
    assertEquals(ok, false);
    assertEquals(msg.includes("cannot start/end with hyphen"), true);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("validate: name ending with hyphen", async () => {
  const dir = await makeSkillDir(validSkillMd({ name: "my-skill-" }));
  try {
    const [ok, msg] = validateSkill(dir);
    assertEquals(ok, false);
    assertEquals(msg.includes("cannot start/end with hyphen"), true);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("validate: name with consecutive hyphens", async () => {
  const dir = await makeSkillDir(validSkillMd({ name: "my--skill" }));
  try {
    const [ok, msg] = validateSkill(dir);
    assertEquals(ok, false);
    assertEquals(msg.includes("consecutive hyphens"), true);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("validate: name too long (>64 chars)", async () => {
  const longName = "a-" + "b".repeat(63); // 65 chars
  const dir = await makeSkillDir(validSkillMd({ name: longName }));
  try {
    const [ok, msg] = validateSkill(dir);
    assertEquals(ok, false);
    assertEquals(msg.includes("too long"), true);
    assertEquals(msg.includes("Maximum is 64"), true);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("validate: description with angle brackets", async () => {
  const dir = await makeSkillDir(
    validSkillMd({ description: "Use <tag> here" }),
  );
  try {
    const [ok, msg] = validateSkill(dir);
    assertEquals(ok, false);
    assertEquals(msg.includes("angle brackets"), true);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("validate: description too long (>1024 chars)", async () => {
  const longDesc = "x".repeat(1025);
  const dir = await makeSkillDir(
    `---\nname: my-skill\ndescription: ${longDesc}\n---\n`,
  );
  try {
    const [ok, msg] = validateSkill(dir);
    assertEquals(ok, false);
    assertEquals(msg.includes("too long"), true);
    assertEquals(msg.includes("Maximum is 1024"), true);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("validate: SKILL.md too long (>500 lines)", async () => {
  const header = "---\nname: my-skill\ndescription: ok\n---\n";
  const filler = "line\n".repeat(500); // header ~4 lines + 500 = 504
  const dir = await makeSkillDir(header + filler);
  try {
    const [ok, msg] = validateSkill(dir);
    assertEquals(ok, false);
    assertEquals(msg.includes("too long"), true);
    assertEquals(msg.includes("Maximum recommended is 500"), true);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// initSkill tests
// ---------------------------------------------------------------------------

Deno.test("init: creates directory with expected structure", async () => {
  const parent = await Deno.makeTempDir({ prefix: "skill_init_" });
  try {
    const result = await initSkill("test-skill", parent);
    assertEquals(typeof result, "string");

    const skillDir = result!;
    // Check directories exist
    const stat = await Deno.stat(skillDir);
    assertEquals(stat.isDirectory, true);

    const skillMd = await Deno.stat(join(skillDir, "SKILL.md"));
    assertEquals(skillMd.isFile, true);

    const scripts = await Deno.stat(join(skillDir, "scripts"));
    assertEquals(scripts.isDirectory, true);

    const refs = await Deno.stat(join(skillDir, "references"));
    assertEquals(refs.isDirectory, true);

    const assets = await Deno.stat(join(skillDir, "assets"));
    assertEquals(assets.isDirectory, true);
  } finally {
    await Deno.remove(parent, { recursive: true });
  }
});

Deno.test("init: fails if directory already exists", async () => {
  const parent = await Deno.makeTempDir({ prefix: "skill_init_" });
  try {
    // Pre-create the skill directory
    await Deno.mkdir(join(parent, "existing-skill"));

    const result = await initSkill("existing-skill", parent);
    assertEquals(result, null);
  } finally {
    await Deno.remove(parent, { recursive: true });
  }
});

Deno.test("init: --skip-existing returns path when directory exists", async () => {
  const parent = await Deno.makeTempDir({ prefix: "skill_init_" });
  try {
    await Deno.mkdir(join(parent, "existing-skill"));

    const result = await initSkill("existing-skill", parent, {
      skipExisting: true,
    });
    assertEquals(typeof result, "string");
    assertEquals(result !== null, true);
  } finally {
    await Deno.remove(parent, { recursive: true });
  }
});

Deno.test("init: SKILL.md contains correct name in frontmatter", async () => {
  const parent = await Deno.makeTempDir({ prefix: "skill_init_" });
  try {
    const result = await initSkill("my-new-skill", parent);
    assertEquals(typeof result, "string");

    const content = await Deno.readTextFile(join(result!, "SKILL.md"));
    assertEquals(content.includes("name: my-new-skill"), true);
  } finally {
    await Deno.remove(parent, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// titleCaseName unit test (bonus)
// ---------------------------------------------------------------------------

Deno.test("titleCaseName: converts kebab-case to title case", () => {
  assertEquals(titleCaseName("my-new-skill"), "My New Skill");
  assertEquals(titleCaseName("code-review"), "Code Review");
  assertEquals(titleCaseName("single"), "Single");
});
