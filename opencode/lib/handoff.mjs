import { writeFile, mkdir, readFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Persist the absolute path to the bundled artifacts directory so that
 * the Python helpers (resolve_env.py, launch_firefox.py) can locate the
 * extension shipped via the OpenCode npm package.
 *
 * File-based handoff (rather than env var) mirrors the existing
 * ~/.foxcode/port and ~/.foxcode/password pattern and survives subprocess
 * boundaries reliably.
 */
export async function writeHandoff(handoffPath, bundleDirAbsPath) {
  await mkdir(dirname(handoffPath), { recursive: true });
  await writeFile(handoffPath, bundleDirAbsPath + "\n", { mode: 0o644 });
}

export async function readHandoff(handoffPath) {
  if (!existsSync(handoffPath)) return null;
  const text = await readFile(handoffPath, "utf8");
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function clearHandoff(handoffPath) {
  if (existsSync(handoffPath)) {
    await unlink(handoffPath);
  }
}
