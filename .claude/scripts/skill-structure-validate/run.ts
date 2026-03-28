#!/usr/bin/env -S deno run --allow-read

/**
 * skill-structure-validate hook: auto-validate SKILL.md structure after edits.
 * PostToolUse hook — exit 0, stdout JSON with additionalContext on errors.
 */

import { dirname, join, resolve } from "jsr:@std/path";
import { parse as parseYaml } from "jsr:@std/yaml";

/** Check if the file path is a SKILL.md inside a skills/ directory. */
export function isSkillMd(filePath: string): boolean {
  if (!filePath) return false;
  return /\/skills\/[^/]+\/SKILL\.md$/.test(filePath);
}

/**
 * Validate a skill directory. Returns error string or null if valid.
 * Inline validation (does not depend on external validate_skill.ts).
 */
export async function validate(skillDir: string): Promise<string | null> {
  const resolvedPath = resolve(skillDir);
  const skillMdPath = join(resolvedPath, "SKILL.md");

  let content: string;
  try {
    content = await Deno.readTextFile(skillMdPath);
  } catch {
    return "SKILL.md not found";
  }

  // Check frontmatter exists
  if (!content.startsWith("---")) {
    return "No YAML frontmatter found";
  }

  // Extract frontmatter
  const match = content.match(/^---\n(.*?)\n---/s);
  if (!match) {
    return "Invalid frontmatter format";
  }

  // Parse YAML
  let meta: Record<string, unknown>;
  try {
    meta = parseYaml(match[1]) as Record<string, unknown>;
  } catch (e) {
    return `Invalid YAML: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Required fields
  const required = ["name", "description"];
  for (const field of required) {
    if (!meta[field]) {
      return `Missing required field: ${field}`;
    }
  }

  return null;
}

// --- Entry point (stdin → stdout) ---
if (import.meta.main) {
  const input = JSON.parse(await new Response(Deno.stdin.readable).text());
  const filePath: string = input?.tool_input?.file_path ??
    input?.tool_input?.file ?? "";

  if (!filePath || !isSkillMd(filePath)) Deno.exit(0);

  const skillDir = dirname(filePath);
  const error = await validate(skillDir);
  if (error) {
    console.log(
      JSON.stringify({
        additionalContext: `SKILL.md validation failed: ${error}`,
      }),
    );
  }
}
