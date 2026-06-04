import { exec } from "./exec.mjs";

/**
 * Light-weight prerequisite check for the OpenCode integration:
 * - Node.js >= 18 (the channel server requires modern ESM + AbortController)
 * - npm available on PATH (needed so `npx -y foxcode-channel@<pin>` can resolve the channel)
 *
 * Returns { ok: boolean, problems: string[] }.
 * Firefox is discovered and launched by the channel itself via the
 * `launchBrowser` MCP tool (foxcode/channel/launch/discover.mjs).
 */
export async function checkPrereqs() {
  const problems = [];
  const node = await exec(process.execPath, ["--version"]);
  if (node.code !== 0) {
    problems.push(`Node not runnable: exit ${node.code}`);
  } else {
    const major = Number((node.stdout.match(/v(\d+)\./) || [])[1]);
    if (!Number.isFinite(major) || major < 18) {
      problems.push(`Node >= 18 required (have ${node.stdout.trim()})`);
    }
  }
  let npm;
  try {
    npm = await exec("npm", ["--version"]);
  } catch (err) {
    problems.push(`npm not found on PATH: ${err.message}`);
    return { ok: false, problems };
  }
  if (npm.code !== 0) {
    problems.push(`npm not runnable: ${npm.stderr.trim() || `exit ${npm.code}`}`);
  }
  return { ok: problems.length === 0, problems };
}
