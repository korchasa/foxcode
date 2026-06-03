import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

/**
 * Resolve plugin root from a known module URL inside the package.
 * Caller passes a URL relative to the plugin layout:
 *   - from index.mjs:               PLUGIN_ROOT = resolveFromModule(import.meta.url, ".")
 *   - from lib/* or bin/* modules:  PLUGIN_ROOT = resolveFromModule(import.meta.url, "..")
 *
 * Fails fast if the resolved directory does not look like the plugin
 * (no package.json + no index.mjs) — surfaces install corruption early
 * rather than passing garbage paths down the bundle resolver.
 */
export function resolveFromModule(callerUrl, relative) {
  const root = resolve(fileURLToPath(callerUrl), "..", relative);
  if (!existsSync(join(root, "package.json")) || !existsSync(join(root, "index.mjs"))) {
    throw new Error(`Plugin root malformed at ${root} (missing package.json or index.mjs)`);
  }
  return root;
}

/**
 * Compute the absolute paths to bundled artifacts (extension + skills).
 * In a published package they live under `<pluginRoot>/bundle/`; in dev,
 * sources live under `../foxcode/{extension,skills}` relative to opencode/.
 *
 * The channel runtime is no longer bundled (resolved via npx). The
 * `channel` key is preserved here for callers that still want to display
 * a path for diagnostics — but it points at a directory that no longer
 * exists post-prepack.
 */
export function bundlePaths(pluginRoot) {
  const bundleDir = join(pluginRoot, "bundle");
  if (existsSync(bundleDir)) {
    return {
      extension: join(bundleDir, "extension"),
      channel: join(bundleDir, "channel"),
      skills: join(bundleDir, "skills"),
      source: "bundle",
    };
  }
  const repoRoot = resolve(pluginRoot, "..");
  return {
    extension: join(repoRoot, "foxcode", "extension"),
    channel: join(repoRoot, "foxcode", "channel"),
    skills: join(repoRoot, "foxcode", "skills"),
    source: "dev",
  };
}

/**
 * OpenCode skills dir for the current user.
 * Honours XDG_CONFIG_HOME with fallback to ~/.config.
 */
export function userSkillsDir() {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.length > 0 ? xdg : join(homedir(), ".config");
  return join(base, "opencode", "skills");
}

/** Path to the plugin-dir handoff file consumed by Python helpers. */
export function handoffFilePath() {
  return join(homedir(), ".foxcode", "opencode-plugin-dir");
}

/** Path to the global opencode.json (canonical user config). */
export function userOpencodeJson() {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.length > 0 ? xdg : join(homedir(), ".config");
  return join(base, "opencode", "opencode.json");
}
