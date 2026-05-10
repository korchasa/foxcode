import { existsSync } from "node:fs";
import { join } from "node:path";

import { exec } from "./exec.mjs";

/**
 * Ensure the bundled channel has its production dependencies installed.
 * No-op if `node_modules/` already exists. Mirrors the lazy-install pattern
 * used by the CC plugin's `.mcp.json` shell wrapper.
 *
 * Returns one of: "skipped", "installed". Throws on install failure.
 */
export async function ensureChannelDeps(channelDir) {
  if (existsSync(join(channelDir, "node_modules"))) return "skipped";
  if (!existsSync(join(channelDir, "package.json"))) {
    throw new Error(`Channel directory missing package.json: ${channelDir}`);
  }
  const r = await exec("npm", ["ci", "--omit=dev", "--silent"], { cwd: channelDir });
  if (r.code !== 0) {
    throw new Error(
      `npm ci failed in ${channelDir} (exit ${r.code})\n` +
      `stderr:\n${r.stderr}`,
    );
  }
  return "installed";
}
