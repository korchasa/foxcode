#!/usr/bin/env -S deno run -A
/**
 * Rule validation script - validates rule files across IDE formats.
 *
 * Usage:
 *     deno run -A validate_rule.ts <path>
 *
 * Supports:
 *     - Cursor: .cursor/rules/<name>/RULE.md or .cursor/rules/*.mdc
 *     - Claude Code: .claude/rules/*.md or CLAUDE.md
 *     - OpenCode: AGENTS.md, opencode.json "instructions"
 */

import { parse as parseYaml } from "jsr:@std/yaml";
import { join } from "jsr:@std/path";

type Format =
  | "opencode-json"
  | "opencode-agents"
  | "opencode-rule"
  | "claude-agents"
  | "claude-rule"
  | "agents-agents"
  | "cursor-dir"
  | "cursor-legacy"
  | "claude-root"
  | "unknown"
  | null;

function detectFormat(rulePath: string): [Format, string | null] {
  const name = rulePath.split("/").pop() || "";
  const parts = rulePath.split("/");

  // Check if it's an opencode.json file
  if (name === "opencode.json") {
    try {
      const content = Deno.readTextFileSync(rulePath);
      const data = JSON.parse(content);
      if ("instructions" in data) {
        return ["opencode-json", rulePath];
      }
    } catch {
      // JSON decode error or file not found
    }
    return ["unknown", rulePath];
  }

  // Check for .opencode/ directory in path
  if (parts.includes(".opencode")) {
    if (name === "AGENTS.md") {
      return ["opencode-agents", rulePath];
    }
    if (name.endsWith(".md")) {
      return ["opencode-rule", rulePath];
    }
    // Check parent for opencode.json (nested opencode/opencode case)
    const opencodeDirIdx = parts.lastIndexOf(".opencode");
    if (opencodeDirIdx >= 0) {
      const parentName = parts[opencodeDirIdx];
      const grandparentIdx = opencodeDirIdx - 1;
      if (
        parentName === "opencode" &&
        grandparentIdx >= 0 &&
        parts[grandparentIdx] === "opencode"
      ) {
        const parentJsonParts = parts.slice(0, grandparentIdx + 1);
        parentJsonParts.push("opencode.json");
        const parentJson = parentJsonParts.join("/");
        try {
          const content = Deno.readTextFileSync(parentJson);
          const data = JSON.parse(content);
          if ("instructions" in data) {
            return ["opencode-json", parentJson];
          }
        } catch {
          // pass
        }
      }
    }
    return ["unknown", rulePath];
  }

  // Check for Claude-compatible locations (OpenCode fallbacks)
  if (parts.includes(".claude") && name === "AGENTS.md") {
    return ["claude-agents", rulePath];
  }
  if (parts.includes(".claude") && name.endsWith(".md")) {
    return ["claude-rule", rulePath];
  }

  if (parts.includes(".agents") && name === "AGENTS.md") {
    return ["agents-agents", rulePath];
  }

  // Check if directory
  try {
    const stat = Deno.statSync(rulePath);
    if (stat.isDirectory) {
      const ruleMd = join(rulePath, "RULE.md");
      try {
        Deno.statSync(ruleMd);
        return ["cursor-dir", ruleMd];
      } catch {
        return [null, null];
      }
    }
  } catch {
    // File doesn't exist or can't stat - continue with name-based detection
  }

  if (name === "RULE.md") {
    return ["cursor-dir", rulePath];
  }

  if (name.endsWith(".mdc")) {
    return ["cursor-legacy", rulePath];
  }

  if (name === "CLAUDE.md") {
    return ["claude-root", rulePath];
  }

  if (parts.includes(".claude") && name.endsWith(".md")) {
    return ["claude-rule", rulePath];
  }

  return ["unknown", rulePath];
}

function extractFrontmatter(
  content: string,
): [Record<string, unknown> | null, string] {
  if (!content.startsWith("---")) {
    return [null, content];
  }

  const match = content.match(/^---\n(.*?)\n---\n?(.*)/s);
  if (!match) {
    return [null, content];
  }

  try {
    const fm = parseYaml(match[1]);
    if (typeof fm !== "object" || fm === null || Array.isArray(fm)) {
      return [null, content];
    }
    return [fm as Record<string, unknown>, match[2]];
  } catch {
    return [null, content];
  }
}

function validateCursorRule(content: string, _isLegacy = false): string[] {
  const errors: string[] = [];

  const [fm, body] = extractFrontmatter(content);

  if (fm === null) {
    errors.push("No valid YAML frontmatter found");
    return errors;
  }

  // Check allowed fields
  const allowed = new Set(["description", "globs", "alwaysApply"]);
  const unexpected = Object.keys(fm).filter((k) => !allowed.has(k));
  if (unexpected.length > 0) {
    const sortedUnexpected = [...unexpected].sort();
    const sortedAllowed = [...allowed].sort();
    errors.push(
      `Unexpected frontmatter key(s): ${sortedUnexpected.join(", ")}. ` +
        `Allowed: ${sortedAllowed.join(", ")}`,
    );
  }

  // description is required
  if (!("description" in fm)) {
    errors.push("Missing 'description' in frontmatter");
  } else if (
    typeof fm.description !== "string" ||
    !(fm.description as string).trim()
  ) {
    errors.push("'description' must be a non-empty string");
  }

  // alwaysApply validation
  const alwaysApply = fm.alwaysApply;
  if (
    alwaysApply !== undefined && alwaysApply !== null &&
    typeof alwaysApply !== "boolean"
  ) {
    errors.push("'alwaysApply' must be a boolean");
  }

  // globs validation
  const globs = fm.globs;
  if (globs !== undefined && globs !== null && typeof globs !== "string") {
    errors.push("'globs' must be a string");
  }

  // If not alwaysApply, should have globs or description for discovery
  if (!alwaysApply && !globs) {
    if (!fm.description) {
      errors.push(
        "Non-alwaysApply rule without globs must have a description for agent discovery",
      );
    }
  }

  // Line count check
  const lineCount = content.split("\n").length;
  if (lineCount > 500) {
    errors.push(
      `Rule is too long (${lineCount} lines). Maximum is 500 lines.`,
    );
  }

  // Body should not be empty
  if (!body.trim()) {
    errors.push("Rule body is empty — add rule content after frontmatter");
  }

  return errors;
}

function validateClaudeRule(content: string): string[] {
  const errors: string[] = [];

  const [fm, body] = extractFrontmatter(content);

  if (fm !== null) {
    const allowed = new Set(["description", "paths"]);
    const unexpected = Object.keys(fm).filter((k) => !allowed.has(k));
    if (unexpected.length > 0) {
      const sortedUnexpected = [...unexpected].sort();
      const sortedAllowed = [...allowed].sort();
      errors.push(
        `Unexpected frontmatter key(s): ${sortedUnexpected.join(", ")}. ` +
          `Allowed: ${sortedAllowed.join(", ")}`,
      );
    }
  }

  if (!body.trim()) {
    errors.push("Rule body is empty");
  }

  const lineCount = content.split("\n").length;
  if (lineCount > 500) {
    errors.push(
      `Rule is too long (${lineCount} lines). Maximum is 500 lines.`,
    );
  }

  return errors;
}

function validateOpencodeRule(content: string): string[] {
  const errors: string[] = [];

  if (!content.trim()) {
    errors.push("Rule file is empty");
  }

  const lineCount = content.split("\n").length;
  if (lineCount > 500) {
    errors.push(
      `Rule is too long (${lineCount} lines). Maximum is 500 lines.`,
    );
  }

  return errors;
}

function validateOpencodeJson(data: Record<string, unknown>): string[] {
  const errors: string[] = [];

  if (!("instructions" in data)) {
    errors.push("Missing 'instructions' field in opencode.json");
  } else if (!Array.isArray(data.instructions)) {
    errors.push("'instructions' must be an array");
  } else {
    for (let i = 0; i < data.instructions.length; i++) {
      const item = data.instructions[i];
      if (typeof item !== "string" && typeof item !== "object") {
        errors.push(
          `instructions[${i}] must be a string or object with 'path'/'glob'/'url'`,
        );
      } else if (
        typeof item === "object" && item !== null && !Array.isArray(item)
      ) {
        const obj = item as Record<string, unknown>;
        if (!("path" in obj) && !("glob" in obj) && !("url" in obj)) {
          errors.push(
            `instructions[${i}] dict must contain at least one of: path, glob, url`,
          );
        }
      }
    }
  }

  return errors;
}

export function validateRule(path: string): [boolean, string] {
  const [fmt, ruleFile] = detectFormat(path);

  if (fmt === null || ruleFile === null) {
    return [false, `No rule file found at ${path}`];
  }

  try {
    Deno.statSync(ruleFile);
  } catch {
    return [false, `Rule file not found: ${ruleFile}`];
  }

  const content = Deno.readTextFileSync(ruleFile);
  let errors: string[];

  if (fmt === "opencode-json") {
    try {
      const data = JSON.parse(content);
      errors = validateOpencodeJson(data);
    } catch (e) {
      return [false, `Invalid JSON: ${e}`];
    }
  } else if (fmt === "cursor-dir" || fmt === "cursor-legacy") {
    errors = validateCursorRule(content, fmt === "cursor-legacy");
    if (fmt === "cursor-legacy") {
      errors.push(
        "Warning: .mdc format is deprecated. " +
          "Prefer .cursor/rules/<name>/RULE.md directory format.",
      );
    }
  } else if (fmt === "claude-root" || fmt === "claude-rule") {
    errors = validateClaudeRule(content);
  } else if (
    fmt === "opencode-agents" ||
    fmt === "claude-agents" ||
    fmt === "agents-agents"
  ) {
    errors = validateOpencodeRule(content);
  } else {
    errors = ["Unknown format"];
  }

  if (errors.length > 0) {
    return [
      false,
      "Validation issues:\n" + errors.map((e) => `  - ${e}`).join("\n"),
    ];
  }

  return [true, `Rule is valid! (format: ${fmt})`];
}

function main(): void {
  if (Deno.args.length !== 1) {
    console.log("Usage: deno run -A validate_rule.ts <rule-path>");
    console.log("");
    console.log("Supported paths:");
    console.log("  .cursor/rules/my-rule/          (Cursor directory)");
    console.log("  .cursor/rules/my-rule/RULE.md   (Cursor RULE.md)");
    console.log("  .cursor/rules/my-rule.mdc       (Cursor legacy)");
    console.log("  .claude/rules/my-rule.md        (Claude Code)");
    console.log("  CLAUDE.md                       (Claude Code root)");
    console.log("");
    console.log("OpenCode paths:");
    console.log("  .opencode/AGENTS.md              (OpenCode rules)");
    console.log(
      "  .opencode/                       (OpenCode rules directory)",
    );
    console.log("  opencode.json                   (OpenCode config)");
    console.log("");
    console.log("OpenCode fallbacks (Claude-compatible):");
    console.log("  .claude/AGENTS.md                (Claude Code)");
    console.log("  .claude/rules/*.md               (Claude Code)");
    console.log("  .agents/AGENTS.md                (Agent-compatible)");
    console.log("");
    console.log("OpenCode paths:");
    console.log("  .opencode/AGENTS.md              (OpenCode rules)");
    console.log("  .opencode/                   (OpenCode rules directory)");
    console.log("  opencode.json                   (OpenCode config)");
    console.log("");
    console.log("OpenCode fallbacks (Claude-compatible):");
    console.log("  .claude/AGENTS.md                (Claude Code)");
    console.log("  .claude/rules/*.md               (Claude Code)");
    console.log("  .agents/AGENTS.md                (Agent-compatible)");
    Deno.exit(1);
  }

  const [valid, message] = validateRule(Deno.args[0]);
  if (valid) {
    console.log(JSON.stringify({ ok: true, result: { valid: true, message } }));
  } else {
    console.error(message);
    console.log(JSON.stringify({ ok: false, error: message }));
  }
  Deno.exit(valid ? 0 : 1);
}

if (import.meta.main) {
  main();
}
