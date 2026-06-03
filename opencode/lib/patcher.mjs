import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

import { buildFoxcodeMcpEntry } from "./foxcode-mcp-entry.mjs";

const COMMENT_PATTERN = /(^|\s)(\/\/|\/\*)/m;

/**
 * Insert or update mcp.foxcode in a plain-JSON opencode.json.
 *
 * Refuses files containing JSONC comments — caller falls back to printing
 * a manual snippet. Idempotent: repeated calls produce identical output.
 *
 * Returns one of: "created", "added-mcp", "added-foxcode", "updated", "noop".
 */
export async function patchOpencodeJson(configPath) {
  const entry = buildFoxcodeMcpEntry();

  if (!existsSync(configPath)) {
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify({ mcp: { foxcode: entry } }, null, 2) + "\n");
    return "created";
  }

  const text = await readFile(configPath, "utf8");
  if (COMMENT_PATTERN.test(text)) {
    throw new Error(
      `Refusing to patch ${configPath}: contains JSONC comments. ` +
      `Edit manually using the printed snippet.`,
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Refusing to patch ${configPath}: invalid JSON (${err.message})`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Refusing to patch ${configPath}: top-level value is not an object`);
  }

  let action;
  if (!parsed.mcp || typeof parsed.mcp !== "object" || Array.isArray(parsed.mcp)) {
    parsed.mcp = { foxcode: entry };
    action = "added-mcp";
  } else if (!parsed.mcp.foxcode) {
    parsed.mcp.foxcode = entry;
    action = "added-foxcode";
  } else if (jsonEqual(parsed.mcp.foxcode, entry)) {
    return "noop";
  } else {
    parsed.mcp.foxcode = entry;
    action = "updated";
  }

  await writeFile(configPath, JSON.stringify(parsed, null, 2) + "\n");
  return action;
}

/**
 * Equality for plain JSON values (objects, arrays, primitives).
 * Uses key-sorted JSON.stringify so { a:1, b:2 } and { b:2, a:1 } compare equal.
 */
function jsonEqual(a, b) {
  return stableStringify(a) === stableStringify(b);
}

function stableStringify(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const keys = Object.keys(v).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",") + "}";
}
