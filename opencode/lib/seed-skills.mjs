import { mkdir, symlink, readlink, lstat, stat, rm, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const SKILL_NAMES = ["foxcode-run-project-profile", "foxcode-run-user-profile"];

/**
 * Ensure each FoxCode launch skill is reachable from OpenCode's skill discovery
 * by symlinking <userSkillsDir>/<name> -> <bundleSkillsDir>/<name>.
 *
 * Idempotent. Returns a per-skill action log:
 *   "created"           — link did not exist
 *   "kept"              — correct symlink already in place
 *   "replaced-dangling" — symlink existed with wrong/missing target; recreated
 *   "user-dir-kept"     — user-owned real directory; preserved untouched
 *   "copied-fallback"   — symlink unavailable (Windows non-admin); copied
 */
export async function seedSkills({ bundleSkillsDir, userSkillsDir }) {
  await mkdir(userSkillsDir, { recursive: true });
  const result = {};
  for (const name of SKILL_NAMES) {
    result[name] = await seedOne(join(userSkillsDir, name), join(bundleSkillsDir, name));
  }
  return result;
}

async function seedOne(link, target) {
  if (!existsSync(target)) {
    throw new Error(`Bundled skill not found: ${target}`);
  }
  let info;
  try {
    info = await lstat(link);
  } catch {
    return await create(link, target);
  }
  if (!info.isSymbolicLink()) {
    // Real directory or file — preserve user content; do not overwrite.
    return "user-dir-kept";
  }
  const current = await readlink(link);
  if (current === target) {
    try {
      await stat(link);
      return "kept";
    } catch {
      // Correct target string but the file no longer exists at that path.
      // Drop and recreate.
    }
  }
  await rm(link, { force: true });
  const kind = await create(link, target);
  return kind === "copied-fallback" ? kind : "replaced-dangling";
}

async function create(link, target) {
  try {
    await symlink(target, link, "dir");
    return "created";
  } catch (err) {
    if (err.code === "EPERM" || err.code === "EACCES") {
      // Windows non-admin without dev mode: fall back to recursive copy.
      await cp(target, link, { recursive: true, force: true });
      return "copied-fallback";
    }
    throw err;
  }
}
