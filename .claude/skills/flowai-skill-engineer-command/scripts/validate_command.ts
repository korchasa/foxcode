#!/usr/bin/env -S deno run -A
/**
 * Quick validation script for commands - minimal version
 */

import { join } from "jsr:@std/path";
import { parse as parseYaml } from "jsr:@std/yaml";

/** Map JS value to Python's type().__name__ for output parity */
function pythonTypeName(value: unknown): string {
  if (value === null) return "NoneType";
  if (Array.isArray(value)) return "list";
  if (typeof value === "object") return "dict";
  if (typeof value === "number") {
    return Number.isInteger(value) ? "int" : "float";
  }
  if (typeof value === "boolean") return "bool";
  return typeof value; // string, etc.
}

export function validateCommand(commandPath: string): [boolean, string] {
  // Check SKILL.md exists
  const skillMd = join(commandPath, "SKILL.md");
  try {
    Deno.statSync(skillMd);
  } catch {
    return [false, "SKILL.md not found"];
  }

  // Read and validate frontmatter
  const content = Deno.readTextFileSync(skillMd);
  if (!content.startsWith("---")) {
    return [false, "No YAML frontmatter found"];
  }

  // Extract frontmatter
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return [false, "Invalid frontmatter format"];
  }

  const frontmatterText = match[1];

  // Parse YAML frontmatter
  let frontmatter: unknown;
  try {
    frontmatter = parseYaml(frontmatterText);
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
  );
  if (unexpectedKeys.length > 0) {
    const sortedUnexpected = unexpectedKeys.sort().join(", ");
    const sortedAllowed = [...ALLOWED_PROPERTIES].sort().join(", ");
    return [
      false,
      `Unexpected key(s) in SKILL.md frontmatter: ${sortedUnexpected}. Allowed properties are: ${sortedAllowed}`,
    ];
  }

  // Check required fields
  if (!("name" in fm)) {
    return [false, "Missing 'name' in frontmatter"];
  }
  if (!("description" in fm)) {
    return [false, "Missing 'description' in frontmatter"];
  }

  // Extract name for validation
  const rawName = fm["name"];
  if (typeof rawName !== "string") {
    return [false, `Name must be a string, got ${pythonTypeName(rawName)}`];
  }
  const name: string = rawName.trim();
  if (name) {
    // Check naming convention (hyphen-case: lowercase with hyphens)
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
    // Check name length (max 64 characters per spec)
    if (name.length > 64) {
      return [
        false,
        `Name is too long (${name.length} characters). Maximum is 64 characters.`,
      ];
    }
  }

  // Extract and validate description
  const rawDescription = fm["description"];
  if (typeof rawDescription !== "string") {
    return [
      false,
      `Description must be a string, got ${pythonTypeName(rawDescription)}`,
    ];
  }
  const description: string = rawDescription.trim();
  if (description) {
    // Check for angle brackets
    if (description.includes("<") || description.includes(">")) {
      return [false, "Description cannot contain angle brackets (< or >)"];
    }
    // Check description length (max 1024 characters per spec)
    if (description.length > 1024) {
      return [
        false,
        `Description is too long (${description.length} characters). Maximum is 1024 characters.`,
      ];
    }
  }

  return [true, "Command is valid!"];
}

if (import.meta.main) {
  if (Deno.args.length !== 1) {
    console.log("Usage: deno run -A validate_command.ts <command_directory>");
    Deno.exit(1);
  }

  const [valid, message] = validateCommand(Deno.args[0]);
  if (valid) {
    console.log(JSON.stringify({ ok: true, result: { valid: true, message } }));
  } else {
    console.error(message);
    console.log(JSON.stringify({ ok: false, error: message }));
  }
  Deno.exit(valid ? 0 : 1);
}
