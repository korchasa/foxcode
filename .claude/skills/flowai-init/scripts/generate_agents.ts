/**
 * generate_agents.ts — Project analysis tool for flowai-init.
 *
 * No external dependencies — uses only Deno built-ins and jsr: imports.
 *
 * Run:
 *   deno run --allow-read generate_agents.ts <dir>
 *
 * Analyzes the project directory: detects stack, checks which flowai-init
 * components exist, verifies setup completeness. Outputs a single JSON object.
 *
 * File generation (render/apply) is handled by the agent natively using
 * template files from assets/ as reference. This script only provides
 * structured project metadata and verification.
 */

import { join, resolve } from "jsr:@std/path";

function existsSync(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Status of a single file/symlink. */
interface FileStatus {
  exists: boolean;
  is_symlink: boolean;
  /** Symlink target (resolved), empty if not a symlink or doesn't exist. */
  symlink_target: string;
}

/** Inventory of flowai-init components. */
interface Inventory {
  root_agents_md: FileStatus;
  claude_md: FileStatus;
  documents_agents_md: FileStatus;
  documents_claude_md: FileStatus;
  scripts_agents_md: FileStatus;
  scripts_claude_md: FileStatus;
  documents_dir: boolean;
  scripts_dir: boolean;
  devcontainer_dir: boolean;
  opencode_json: { exists: boolean; has_subdirectory_globs: boolean };
}

/** Single verification check. */
interface VerifyCheck {
  ok: boolean;
  message: string;
}

/** Verification result. */
interface Verification {
  passed: boolean;
  checks: VerifyCheck[];
}

/** Combined analysis result. */
interface AnalysisResult {
  is_new: boolean;
  stack: string[];
  files_count: number;
  root_dir: string;
  readme_content: string;
  file_tree: string[];
  inventory: Inventory;
  verification: Verification;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".cursor",
  ".claude",
  ".opencode",
  "dist",
  "build",
  "coverage",
  ".dev",
  "__pycache__",
  "vendor",
]);

/** Check file status: exists, is_symlink, symlink_target. */
function fileStatus(path: string): FileStatus {
  try {
    const lstat = Deno.lstatSync(path);
    if (lstat.isSymlink) {
      const target = Deno.readLinkSync(path);
      return { exists: true, is_symlink: true, symlink_target: target };
    }
    return { exists: true, is_symlink: false, symlink_target: "" };
  } catch {
    return { exists: false, is_symlink: false, symlink_target: "" };
  }
}

/** Check if directory exists. */
function dirExists(path: string): boolean {
  try {
    const stat = Deno.statSync(path);
    return stat.isDirectory;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/** Analyze project: detect stack, inventory components, verify setup. */
async function analyzeProject(rootDir: string): Promise<AnalysisResult> {
  // --- File tree walk ---
  const files: string[] = [];
  const fileTree: string[] = [];
  let readmeContent = "";

  async function walk(dir: string): Promise<void> {
    for await (const entry of Deno.readDir(dir)) {
      if (SKIP_DIRS.has(entry.name)) continue;

      const fullPath = join(dir, entry.name);
      if (entry.isDirectory) {
        await walk(fullPath);
      } else if (entry.isFile) {
        files.push(fullPath);
        const rel = fullPath.slice(rootDir.length + 1);
        fileTree.push(rel);

        if (entry.name.toLowerCase() === "readme.md" && !readmeContent) {
          try {
            readmeContent = await Deno.readTextFile(fullPath);
          } catch {
            // ignore
          }
        }
      }
    }
  }

  await walk(rootDir);

  // --- Stack detection ---
  const stack: string[] = [];
  const check = (file: string, name: string) => {
    if (existsSync(join(rootDir, file))) stack.push(name);
  };

  check("package.json", "Node.js");
  check("deno.json", "Deno");
  check("go.mod", "Go");
  check("Cargo.toml", "Rust");
  if (
    existsSync(join(rootDir, "requirements.txt")) ||
    existsSync(join(rootDir, "pyproject.toml"))
  ) {
    stack.push("Python");
  }
  check("Package.swift", "Swift");

  const isNew = stack.length === 0 && files.length < 5;

  // --- Inventory ---
  const opencodePath = join(rootDir, "opencode.json");
  const opencodeResult = { exists: false, has_subdirectory_globs: false };

  if (existsSync(opencodePath)) {
    opencodeResult.exists = true;
    try {
      const raw = Deno.readTextFileSync(opencodePath);
      const parsed = JSON.parse(raw);
      const instructions: string[] = Array.isArray(parsed.instructions)
        ? parsed.instructions
        : [];
      const joined = instructions.join(" ");
      opencodeResult.has_subdirectory_globs =
        joined.includes("documents/AGENTS.md") &&
        joined.includes("scripts/AGENTS.md");
    } catch {
      // malformed JSON — treat as no globs
    }
  }

  const inventory: Inventory = {
    root_agents_md: fileStatus(join(rootDir, "AGENTS.md")),
    claude_md: fileStatus(join(rootDir, "CLAUDE.md")),
    documents_agents_md: fileStatus(join(rootDir, "documents", "AGENTS.md")),
    documents_claude_md: fileStatus(join(rootDir, "documents", "CLAUDE.md")),
    scripts_agents_md: fileStatus(join(rootDir, "scripts", "AGENTS.md")),
    scripts_claude_md: fileStatus(join(rootDir, "scripts", "CLAUDE.md")),
    documents_dir: dirExists(join(rootDir, "documents")),
    scripts_dir: dirExists(join(rootDir, "scripts")),
    devcontainer_dir: dirExists(join(rootDir, ".devcontainer")),
    opencode_json: opencodeResult,
  };

  // --- Verification ---
  const checks: VerifyCheck[] = [];

  const rootAgents = inventory.root_agents_md.exists;
  checks.push({
    ok: rootAgents,
    message: rootAgents ? "./AGENTS.md exists" : "./AGENTS.md is missing",
  });

  const docsAgents = inventory.documents_agents_md.exists;
  checks.push({
    ok: docsAgents,
    message: docsAgents
      ? "./documents/AGENTS.md exists"
      : "./documents/AGENTS.md is missing",
  });

  const scriptsAgents = inventory.scripts_agents_md.exists;
  checks.push({
    ok: scriptsAgents,
    message: scriptsAgents
      ? "./scripts/AGENTS.md exists"
      : "./scripts/AGENTS.md is missing",
  });

  const claudeStatus = inventory.claude_md;
  const symlinkOk = claudeStatus.exists &&
    claudeStatus.is_symlink &&
    claudeStatus.symlink_target === "AGENTS.md";
  checks.push({
    ok: symlinkOk,
    message: symlinkOk
      ? "./CLAUDE.md is a correct symlink to AGENTS.md"
      : !claudeStatus.exists
      ? "./CLAUDE.md is missing"
      : !claudeStatus.is_symlink
      ? "./CLAUDE.md exists but is not a symlink"
      : `./CLAUDE.md symlink points to "${claudeStatus.symlink_target}" instead of "AGENTS.md"`,
  });

  const docsClaudeStatus = inventory.documents_claude_md;
  const docsSymlinkOk = docsClaudeStatus.exists &&
    docsClaudeStatus.is_symlink &&
    docsClaudeStatus.symlink_target === "AGENTS.md";
  checks.push({
    ok: docsSymlinkOk,
    message: docsSymlinkOk
      ? "./documents/CLAUDE.md is a correct symlink to AGENTS.md"
      : !docsClaudeStatus.exists
      ? "./documents/CLAUDE.md is missing"
      : !docsClaudeStatus.is_symlink
      ? "./documents/CLAUDE.md exists but is not a symlink"
      : `./documents/CLAUDE.md symlink points to "${docsClaudeStatus.symlink_target}" instead of "AGENTS.md"`,
  });

  const scriptsClaudeStatus = inventory.scripts_claude_md;
  const scriptsSymlinkOk = scriptsClaudeStatus.exists &&
    scriptsClaudeStatus.is_symlink &&
    scriptsClaudeStatus.symlink_target === "AGENTS.md";
  checks.push({
    ok: scriptsSymlinkOk,
    message: scriptsSymlinkOk
      ? "./scripts/CLAUDE.md is a correct symlink to AGENTS.md"
      : !scriptsClaudeStatus.exists
      ? "./scripts/CLAUDE.md is missing"
      : !scriptsClaudeStatus.is_symlink
      ? "./scripts/CLAUDE.md exists but is not a symlink"
      : `./scripts/CLAUDE.md symlink points to "${scriptsClaudeStatus.symlink_target}" instead of "AGENTS.md"`,
  });

  const docsDir = inventory.documents_dir;
  checks.push({
    ok: docsDir,
    message: docsDir
      ? "./documents/ directory exists"
      : "./documents/ directory is missing",
  });

  const verification: Verification = {
    passed: checks.every((c) => c.ok),
    checks,
  };

  return {
    is_new: isNew,
    stack,
    files_count: files.length,
    root_dir: rootDir,
    readme_content: readmeContent,
    file_tree: fileTree.slice(0, 200),
    inventory,
    verification,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const dir = resolve(Deno.args[0] ?? Deno.cwd());
  const analysis = await analyzeProject(dir);
  const ok = analysis.verification.passed;
  console.log(JSON.stringify({ ok, result: analysis }, null, 2));
  if (!ok) Deno.exit(1);
}

// Export for testing
export { analyzeProject };
export type {
  AnalysisResult,
  FileStatus,
  Inventory,
  Verification,
  VerifyCheck,
};

if (import.meta.main) {
  main();
}
