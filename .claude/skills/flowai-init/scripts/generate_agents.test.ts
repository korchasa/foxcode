import { assertEquals } from "jsr:@std/assert";
import { join } from "jsr:@std/path";
import { analyzeProject } from "./generate_agents.ts";
import type { AnalysisResult } from "./generate_agents.ts";

// ---------------------------------------------------------------------------
// Stack detection
// ---------------------------------------------------------------------------

Deno.test("detects Deno project", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(join(tmpDir, "deno.json"), "{}");
    await Deno.writeTextFile(join(tmpDir, "main.ts"), "console.log('hi')");
    const r: AnalysisResult = await analyzeProject(tmpDir);
    assertEquals(r.stack.includes("Deno"), true);
    assertEquals(r.is_new, false);
    assertEquals(r.files_count >= 2, true);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("detects empty project", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const r = await analyzeProject(tmpDir);
    assertEquals(r.is_new, true);
    assertEquals(r.stack.length, 0);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("detects Node.js project", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(join(tmpDir, "package.json"), '{"name":"test"}');
    await Deno.writeTextFile(join(tmpDir, "index.js"), "");
    const r = await analyzeProject(tmpDir);
    assertEquals(r.stack.includes("Node.js"), true);
    assertEquals(r.is_new, false);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("detects Go project", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(join(tmpDir, "go.mod"), "module test");
    await Deno.writeTextFile(join(tmpDir, "main.go"), "package main");
    const r = await analyzeProject(tmpDir);
    assertEquals(r.stack.includes("Go"), true);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("reads README content", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(
      join(tmpDir, "README.md"),
      "# My Project\nDescription here",
    );
    const r = await analyzeProject(tmpDir);
    assertEquals(r.readme_content.includes("# My Project"), true);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("skips .git and node_modules", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(join(tmpDir, ".git"), { recursive: true });
    await Deno.writeTextFile(join(tmpDir, ".git", "config"), "git stuff");
    await Deno.mkdir(join(tmpDir, "node_modules", "pkg"), { recursive: true });
    await Deno.writeTextFile(
      join(tmpDir, "node_modules", "pkg", "index.js"),
      "",
    );
    await Deno.writeTextFile(join(tmpDir, "src.ts"), "code");
    const r = await analyzeProject(tmpDir);
    assertEquals(r.files_count, 1);
    assertEquals(r.file_tree.includes("src.ts"), true);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("detects multiple stacks", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(join(tmpDir, "deno.json"), "{}");
    await Deno.writeTextFile(join(tmpDir, "requirements.txt"), "flask");
    await Deno.writeTextFile(join(tmpDir, "main.ts"), "");
    const r = await analyzeProject(tmpDir);
    assertEquals(r.stack.includes("Deno"), true);
    assertEquals(r.stack.includes("Python"), true);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// Inventory (component detection)
// ---------------------------------------------------------------------------

Deno.test("reports all missing in empty dir", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const r = await analyzeProject(tmpDir);
    assertEquals(r.inventory.root_agents_md.exists, false);
    assertEquals(r.inventory.claude_md.exists, false);
    assertEquals(r.inventory.documents_agents_md.exists, false);
    assertEquals(r.inventory.scripts_agents_md.exists, false);
    assertEquals(r.inventory.documents_dir, false);
    assertEquals(r.inventory.scripts_dir, false);
    assertEquals(r.inventory.devcontainer_dir, false);
    assertEquals(r.inventory.opencode_json.exists, false);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("detects existing AGENTS.md files", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(join(tmpDir, "AGENTS.md"), "# rules");
    await Deno.mkdir(join(tmpDir, "documents"), { recursive: true });
    await Deno.writeTextFile(
      join(tmpDir, "documents", "AGENTS.md"),
      "# docs",
    );
    const r = await analyzeProject(tmpDir);
    assertEquals(r.inventory.root_agents_md.exists, true);
    assertEquals(r.inventory.root_agents_md.is_symlink, false);
    assertEquals(r.inventory.documents_agents_md.exists, true);
    assertEquals(r.inventory.documents_dir, true);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("detects CLAUDE.md symlink", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(join(tmpDir, "AGENTS.md"), "# rules");
    await Deno.symlink("AGENTS.md", join(tmpDir, "CLAUDE.md"));
    const r = await analyzeProject(tmpDir);
    assertEquals(r.inventory.claude_md.exists, true);
    assertEquals(r.inventory.claude_md.is_symlink, true);
    assertEquals(r.inventory.claude_md.symlink_target, "AGENTS.md");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("detects CLAUDE.md as regular file", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(join(tmpDir, "CLAUDE.md"), "# not a symlink");
    const r = await analyzeProject(tmpDir);
    assertEquals(r.inventory.claude_md.exists, true);
    assertEquals(r.inventory.claude_md.is_symlink, false);
    assertEquals(r.inventory.claude_md.symlink_target, "");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("checks opencode.json globs", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(
      join(tmpDir, "opencode.json"),
      JSON.stringify({
        instructions: ["documents/AGENTS.md", "scripts/AGENTS.md"],
      }),
    );
    const r = await analyzeProject(tmpDir);
    assertEquals(r.inventory.opencode_json.exists, true);
    assertEquals(r.inventory.opencode_json.has_subdirectory_globs, true);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("detects missing opencode globs", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(
      join(tmpDir, "opencode.json"),
      JSON.stringify({ instructions: [] }),
    );
    const r = await analyzeProject(tmpDir);
    assertEquals(r.inventory.opencode_json.exists, true);
    assertEquals(r.inventory.opencode_json.has_subdirectory_globs, false);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("detects documents/CLAUDE.md symlink", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(join(tmpDir, "documents"), { recursive: true });
    await Deno.writeTextFile(
      join(tmpDir, "documents", "AGENTS.md"),
      "# docs",
    );
    await Deno.symlink("AGENTS.md", join(tmpDir, "documents", "CLAUDE.md"));
    const r = await analyzeProject(tmpDir);
    assertEquals(r.inventory.documents_claude_md.exists, true);
    assertEquals(r.inventory.documents_claude_md.is_symlink, true);
    assertEquals(r.inventory.documents_claude_md.symlink_target, "AGENTS.md");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("detects scripts/CLAUDE.md symlink", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(join(tmpDir, "scripts"), { recursive: true });
    await Deno.writeTextFile(
      join(tmpDir, "scripts", "AGENTS.md"),
      "# scripts",
    );
    await Deno.symlink("AGENTS.md", join(tmpDir, "scripts", "CLAUDE.md"));
    const r = await analyzeProject(tmpDir);
    assertEquals(r.inventory.scripts_claude_md.exists, true);
    assertEquals(r.inventory.scripts_claude_md.is_symlink, true);
    assertEquals(r.inventory.scripts_claude_md.symlink_target, "AGENTS.md");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

Deno.test("verification fails on empty dir", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const r = await analyzeProject(tmpDir);
    assertEquals(r.verification.passed, false);
    assertEquals(r.verification.checks.length > 0, true);
    assertEquals(r.verification.checks.some((c) => !c.ok), true);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("verification passes with complete setup", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(join(tmpDir, "AGENTS.md"), "# rules");
    await Deno.symlink("AGENTS.md", join(tmpDir, "CLAUDE.md"));
    await Deno.mkdir(join(tmpDir, "documents"), { recursive: true });
    await Deno.writeTextFile(
      join(tmpDir, "documents", "AGENTS.md"),
      "# docs",
    );
    await Deno.symlink("AGENTS.md", join(tmpDir, "documents", "CLAUDE.md"));
    await Deno.mkdir(join(tmpDir, "scripts"), { recursive: true });
    await Deno.writeTextFile(
      join(tmpDir, "scripts", "AGENTS.md"),
      "# scripts",
    );
    await Deno.symlink("AGENTS.md", join(tmpDir, "scripts", "CLAUDE.md"));

    const r = await analyzeProject(tmpDir);
    assertEquals(r.verification.passed, true);
    assertEquals(r.verification.checks.every((c) => c.ok), true);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("verification fails when subdirectory CLAUDE.md symlinks missing", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(join(tmpDir, "AGENTS.md"), "# rules");
    await Deno.symlink("AGENTS.md", join(tmpDir, "CLAUDE.md"));
    await Deno.mkdir(join(tmpDir, "documents"), { recursive: true });
    await Deno.writeTextFile(
      join(tmpDir, "documents", "AGENTS.md"),
      "# docs",
    );
    await Deno.mkdir(join(tmpDir, "scripts"), { recursive: true });
    await Deno.writeTextFile(
      join(tmpDir, "scripts", "AGENTS.md"),
      "# scripts",
    );

    const r = await analyzeProject(tmpDir);
    assertEquals(r.verification.passed, false);
    const docCheck = r.verification.checks.find((c) =>
      c.message.includes("documents/CLAUDE.md")
    );
    assertEquals(docCheck?.ok, false);
    const scriptsCheck = r.verification.checks.find((c) =>
      c.message.includes("scripts/CLAUDE.md")
    );
    assertEquals(scriptsCheck?.ok, false);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("verification detects wrong CLAUDE.md symlink target", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(join(tmpDir, "AGENTS.md"), "# rules");
    await Deno.writeTextFile(join(tmpDir, "OTHER.md"), "# other");
    await Deno.symlink("OTHER.md", join(tmpDir, "CLAUDE.md"));
    await Deno.mkdir(join(tmpDir, "documents"), { recursive: true });
    await Deno.writeTextFile(
      join(tmpDir, "documents", "AGENTS.md"),
      "# docs",
    );
    await Deno.mkdir(join(tmpDir, "scripts"), { recursive: true });
    await Deno.writeTextFile(
      join(tmpDir, "scripts", "AGENTS.md"),
      "# scripts",
    );

    const r = await analyzeProject(tmpDir);
    assertEquals(r.verification.passed, false);
    const symlinkCheck = r.verification.checks.find((c) =>
      c.message.includes("CLAUDE.md")
    );
    assertEquals(symlinkCheck?.ok, false);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});
