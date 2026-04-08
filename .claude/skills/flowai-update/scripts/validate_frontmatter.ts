#!/usr/bin/env -S deno run -A
/**
 * Validates frontmatter of all primitives (skills, agents) in IDE config directories.
 *
 * Usage:
 *   deno run -A validate_frontmatter.ts .claude
 *   deno run -A validate_frontmatter.ts .cursor .opencode
 *
 * Scans {configDir}/skills/{name}/SKILL.md and {configDir}/agents/{name}.md,
 * validates required frontmatter fields (name, description), format, and name match.
 *
 * Exit code 0 = all valid, 1 = errors found.
 */
import { join } from "jsr:@std/path";
import { parse as parseYaml } from "jsr:@std/yaml";

export type ValidationError = {
  path: string;
  field: string;
  message: string;
};

const NAME_PATTERN = /^[a-z0-9]([a-z0-9]*(-[a-z0-9]+)*)?$/;
const NAME_MAX = 64;
const DESC_MAX = 1024;

/** Parse YAML frontmatter from markdown content. */
export function parseFrontmatter(
  content: string,
): Record<string, unknown> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  let data: unknown;
  try {
    data = parseYaml(match[1]);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }
  return data as Record<string, unknown>;
}

/** Validate name field: required, string, hyphen-case, max length, matches expected. */
function validateName(
  expectedName: string,
  data: Record<string, unknown>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!("name" in data)) {
    errors.push({ path: expectedName, field: "name", message: "missing" });
    return errors;
  }

  if (typeof data.name !== "string") {
    errors.push({
      path: expectedName,
      field: "name",
      message: `must be a string, got ${typeof data.name}`,
    });
    return errors;
  }

  const name = data.name;
  if (!NAME_PATTERN.test(name)) {
    errors.push({
      path: expectedName,
      field: "name",
      message:
        `'${name}' must be hyphen-case (lowercase letters, digits, hyphens)`,
    });
  }
  if (name.length > NAME_MAX) {
    errors.push({
      path: expectedName,
      field: "name",
      message: `'${name}' exceeds ${NAME_MAX} chars`,
    });
  }
  if (name !== expectedName) {
    errors.push({
      path: expectedName,
      field: "name",
      message: `'${name}' does not match expected '${expectedName}'`,
    });
  }

  return errors;
}

/** Validate description field: required, string, max length. */
function validateDescription(
  id: string,
  data: Record<string, unknown>,
): ValidationError[] {
  if (!("description" in data)) {
    return [{ path: id, field: "description", message: "missing" }];
  }
  if (typeof data.description !== "string") {
    return [{
      path: id,
      field: "description",
      message: `must be a string, got ${typeof data.description}`,
    }];
  }
  if (data.description.length > DESC_MAX) {
    return [{
      path: id,
      field: "description",
      message: `exceeds ${DESC_MAX} chars`,
    }];
  }
  return [];
}

/** Validate skill frontmatter (name + description + allowed optional fields). */
export function validateSkillFrontmatter(
  dirName: string,
  data: Record<string, unknown>,
): ValidationError[] {
  return [
    ...validateName(dirName, data),
    ...validateDescription(dirName, data),
  ];
}

/** Validate agent frontmatter (name + description + allowed optional fields). */
export function validateAgentFrontmatter(
  fileName: string,
  data: Record<string, unknown>,
): ValidationError[] {
  return [
    ...validateName(fileName, data),
    ...validateDescription(fileName, data),
  ];
}

/** Scan and validate all skills in <configDir>/skills/. */
async function validateSkillsDir(
  configDir: string,
): Promise<ValidationError[]> {
  const skillsDir = join(configDir, "skills");
  const errors: ValidationError[] = [];

  try {
    for await (const entry of Deno.readDir(skillsDir)) {
      if (!entry.isDirectory) continue;
      const skillMdPath = join(skillsDir, entry.name, "SKILL.md");
      let content: string;
      try {
        content = await Deno.readTextFile(skillMdPath);
      } catch {
        errors.push({
          path: entry.name,
          field: "SKILL.md",
          message: "file not found",
        });
        continue;
      }

      const fm = parseFrontmatter(content);
      if (!fm) {
        errors.push({
          path: entry.name,
          field: "frontmatter",
          message: "invalid or missing YAML frontmatter",
        });
        continue;
      }

      errors.push(...validateSkillFrontmatter(entry.name, fm));
    }
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }

  return errors;
}

/** Scan and validate all agents in <configDir>/agents/. */
async function validateAgentsDir(
  configDir: string,
): Promise<ValidationError[]> {
  const agentsDir = join(configDir, "agents");
  const errors: ValidationError[] = [];

  try {
    for await (const entry of Deno.readDir(agentsDir)) {
      if (!entry.isFile || !entry.name.endsWith(".md")) continue;
      const stem = entry.name.replace(/\.md$/, "");
      const filePath = join(agentsDir, entry.name);
      let content: string;
      try {
        content = await Deno.readTextFile(filePath);
      } catch {
        errors.push({
          path: stem,
          field: "file",
          message: "cannot read file",
        });
        continue;
      }

      const fm = parseFrontmatter(content);
      if (!fm) {
        errors.push({
          path: stem,
          field: "frontmatter",
          message: "invalid or missing YAML frontmatter",
        });
        continue;
      }

      errors.push(...validateAgentFrontmatter(stem, fm));
    }
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }

  return errors;
}

/** Validate all primitives in the given IDE config directories. */
export async function validateAll(
  configDirs: string[],
): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];
  for (const dir of configDirs) {
    errors.push(...await validateSkillsDir(dir));
    errors.push(...await validateAgentsDir(dir));
  }
  return errors;
}

if (import.meta.main) {
  const dirs = Deno.args;
  if (dirs.length === 0) {
    console.error(
      "Usage: deno run -A validate_frontmatter.ts <configDir> [<configDir>...]",
    );
    console.error("Example: deno run -A validate_frontmatter.ts .claude");
    Deno.exit(1);
  }

  console.log(`Validating frontmatter in: ${dirs.join(", ")}...`);
  const errors = await validateAll(dirs);

  if (errors.length > 0) {
    for (const e of errors) {
      console.error(`❌ ${e.path}: [${e.field}] ${e.message}`);
    }
    console.error(`\n${errors.length} violation(s) found.`);
    console.log(
      JSON.stringify({ ok: false, errors: errors.length, details: errors }),
    );
    Deno.exit(1);
  } else {
    console.log("✅ All primitives pass frontmatter validation.");
    console.log(JSON.stringify({ ok: true, errors: 0 }));
  }
}
