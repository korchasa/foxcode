import { readFile } from "node:fs/promises";

import { buildFoxcodeMcpEntry } from "./foxcode-mcp-entry.mjs";

/**
 * Build the JSON snippet for the user to paste into opencode.json.
 * Returns a string with a leading `// Add to opencode.json …` comment
 * followed by a `mcp.foxcode` block whose shape comes from the single
 * source of truth in foxcode-mcp-entry.mjs.
 */
export function buildMcpSnippet(channelServerAbsPath) {
  const cfg = { mcp: { foxcode: buildFoxcodeMcpEntry(channelServerAbsPath) } };
  return `// Add to opencode.json (rerun OpenCode after):\n${JSON.stringify(cfg, null, 2)}`;
}

/**
 * Inspect a parsed opencode config object for the foxcode MCP entry.
 * Returns true if mcp.foxcode is present (regardless of enabled flag).
 */
export function hasFoxcodeMcp(parsed) {
  return Boolean(parsed && parsed.mcp && typeof parsed.mcp === "object" && parsed.mcp.foxcode);
}

/**
 * Read and parse a JSON file (plain JSON only). Returns null if missing.
 * Throws on invalid JSON to surface user errors clearly (no silent fallback).
 */
export async function readJsonOrNull(path) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
  return JSON.parse(text);
}

/**
 * Decide whether a snippet should be emitted given a list of config file paths.
 * Returns the configFile path that contains foxcode, or null if none does.
 * On parse failure, the original SyntaxError is wrapped with the file path
 * but the underlying message (with line/column) is preserved.
 */
export async function findConfigWithFoxcode(configPaths) {
  for (const p of configPaths) {
    let parsed;
    try {
      parsed = await readJsonOrNull(p);
    } catch (err) {
      throw new Error(`Cannot parse ${p}: ${err.message}`);
    }
    if (parsed && hasFoxcodeMcp(parsed)) return p;
  }
  return null;
}
