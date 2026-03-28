#!/usr/bin/env -S deno run -A
/**
 * Quick validation script for skills - minimal version
 */

import { join, resolve } from "jsr:@std/path";
import { parse } from "jsr:@std/yaml";

export function validateSkill(
  skillPath: string,
): [boolean, string] {
  const resolvedPath = resolve(skillPath);

  // Check SKILL.md exists
  const skillMdPath = join(resolvedPath, "SKILL.md");
  let content: string;
  try {
    content = Deno.readTextFileSync(skillMdPath);
  } catch {
    return [false, "SKILL.md not found"];
  }

  // Check frontmatter exists
  if (!content.startsWith("---")) {
    return [false, "No YAML frontmatter found"];
  }

  // Extract frontmatter
  const match = content.match(/^---\n(.*?)\n---/s);
  if (!match) {
    return [false, "Invalid frontmatter format"];
  }

  const frontmatterText = match[1];

  // Parse YAML frontmatter
  let frontmatter: unknown;
  try {
    frontmatter = parse(frontmatterText);
    if (
      typeof frontmatter !== "object" || frontmatter === null ||
      Array.isArray(frontmatter)
    ) {
      return [false, "Frontmatter must be a YAML dictionary"];
    }
  } catch (e) {
    return [false, `Invalid YAML in frontmatter: ${e}`];
  }

  const fm = frontmatter as Record<string, unknown>;

  // Define allowed properties
  const ALLOWED_PROPERTIES = new Set([
    "name",
    "description",
    "license",
    "allowed-tools",
    "metadata",
  ]);

  // Check for unexpected properties
  const unexpectedKeys = Object.keys(fm).filter((k) =>
    !ALLOWED_PROPERTIES.has(k)
  ).sort();
  if (unexpectedKeys.length > 0) {
    const allowedSorted = [...ALLOWED_PROPERTIES].sort();
    return [
      false,
      `Unexpected key(s) in SKILL.md frontmatter: ${
        unexpectedKeys.join(", ")
      }. ` +
      `Allowed properties are: ${allowedSorted.join(", ")}`,
    ];
  }

  // Check required fields
  if (!("name" in fm)) {
    return [false, "Missing 'name' in frontmatter"];
  }
  if (!("description" in fm)) {
    return [false, "Missing 'description' in frontmatter"];
  }

  // Validate name
  const rawName = fm["name"];
  if (typeof rawName !== "string") {
    const typeName = rawName === null
      ? "NoneType"
      : typeof rawName === "number"
      ? (Number.isInteger(rawName) ? "int" : "float")
      : typeof rawName === "boolean"
      ? "bool"
      : Array.isArray(rawName)
      ? "list"
      : typeof rawName;
    return [false, `Name must be a string, got ${typeName}`];
  }
  const name = rawName.trim();
  if (name) {
    if (!/^[a-z0-9-]+$/.test(name)) {
      return [
        false,
        `Name '${name}' should be hyphen-case (lowercase letters, digits, and hyphens only)`,
      ];
    }
    if (name.startsWith("-") || name.endsWith("-") || name.includes("--")) {
      return [
        false,
        `Name '${name}' cannot start/end with hyphen or contain consecutive hyphens`,
      ];
    }
    if (name.length > 64) {
      return [
        false,
        `Name is too long (${name.length} characters). Maximum is 64 characters.`,
      ];
    }
  }

  // Validate description
  const rawDescription = fm["description"];
  if (typeof rawDescription !== "string") {
    const typeName = rawDescription === null
      ? "NoneType"
      : typeof rawDescription === "number"
      ? (Number.isInteger(rawDescription) ? "int" : "float")
      : typeof rawDescription === "boolean"
      ? "bool"
      : Array.isArray(rawDescription)
      ? "list"
      : typeof rawDescription;
    return [false, `Description must be a string, got ${typeName}`];
  }
  const description = rawDescription.trim();
  if (description) {
    if (description.includes("<") || description.includes(">")) {
      return [false, "Description cannot contain angle brackets (< or >)"];
    }
    if (description.length > 1024) {
      return [
        false,
        `Description is too long (${description.length} characters). Maximum is 1024 characters.`,
      ];
    }
  }

  // Check SKILL.md line count
  // Match Python's str.splitlines() behavior: trailing newline doesn't add an extra line
  const lines = content.split(/\r\n|\r|\n/);
  const lineCount = (lines.length > 0 && lines[lines.length - 1] === "")
    ? lines.length - 1
    : lines.length;
  if (lineCount > 500) {
    return [
      false,
      `SKILL.md is too long (${lineCount} lines). Maximum recommended is 500 lines.`,
    ];
  }

  return [true, "Skill is valid!"];
}

if (import.meta.main) {
  if (Deno.args.length !== 1) {
    console.error("Usage: deno run -A validate_skill.ts <skill_directory>");
    Deno.exit(1);
  }

  const [valid, message] = validateSkill(Deno.args[0]);
  if (valid) {
    console.log(JSON.stringify({ ok: true, result: { valid: true, message } }));
  } else {
    console.error(message);
    console.log(JSON.stringify({ ok: false, error: message }));
  }
  Deno.exit(valid ? 0 : 1);
}
