import { readFile } from "node:fs/promises";

/**
 * Minimal YAML-frontmatter parser tailored to OpenCode's requirements:
 * top-level scalar keys only. Returns { name, description, ... } or throws.
 *
 * OpenCode skill spec recognises only: name (required), description (required),
 * license, compatibility, metadata. Unrecognised keys are ignored at runtime,
 * so we don't validate against an allow-list — just enforce required fields.
 */
export function parseFrontmatter(text) {
  if (!text.startsWith("---")) {
    throw new Error("Missing YAML frontmatter (file must start with '---')");
  }
  const end = text.indexOf("\n---", 3);
  if (end < 0) throw new Error("Unterminated YAML frontmatter");
  const block = text.slice(3, end).replace(/^\r?\n/, "");
  const out = {};
  for (const raw of block.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (!line || /^\s*#/.test(line) || /^\s/.test(raw)) continue; // skip nested/comment/blank
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    let value = m[2];
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    out[key] = value;
  }
  if (!out.name) throw new Error("Frontmatter missing required field: name");
  if (!out.description) throw new Error("Frontmatter missing required field: description");
  return out;
}

export async function parseSkillFile(path) {
  const text = await readFile(path, "utf8");
  return parseFrontmatter(text);
}
