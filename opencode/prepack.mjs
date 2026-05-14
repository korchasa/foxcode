#!/usr/bin/env node
/**
 * Bundle assembly at npm-pack/publish time.
 *
 *   1. Read version from foxcode/.claude-plugin/plugin.json (single source of truth)
 *      and write it back into opencode/package.json.
 *   2. Copy ../foxcode/extension, ../foxcode/channel, ../foxcode/skills/foxcode-run-* into
 *      ./bundle/ (excluding node_modules/, build/, .foxcode/).
 *
 * Channel deps are NOT installed here — the plugin/CLI runs `npm ci --omit=dev`
 * lazily on first use. This keeps the published tarball small and matches the
 * existing CC-plugin lazy-install pattern.
 */
import { cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

function parseOutArg() {
  const idx = process.argv.findIndex((a) => a === "--out" || a.startsWith("--out="));
  if (idx < 0) return join(HERE, "bundle");
  const arg = process.argv[idx];
  if (arg.includes("=")) return resolve(arg.split("=").slice(1).join("="));
  return resolve(process.argv[idx + 1]);
}

const BUNDLE = parseOutArg();

const SKIP_NAMES = new Set(["node_modules", ".foxcode", "build", ".DS_Store"]);

async function copyTree(src, dst) {
  await cp(src, dst, {
    recursive: true,
    force: true,
    filter: (s) => {
      const base = s.split(/[\\/]/).pop();
      return !SKIP_NAMES.has(base);
    },
  });
}

async function syncVersion() {
  const pluginJsonPath = join(REPO_ROOT, "foxcode", ".claude-plugin", "plugin.json");
  const opencodePkgPath = join(HERE, "package.json");
  const plugin = JSON.parse(await readFile(pluginJsonPath, "utf8"));
  const pkg = JSON.parse(await readFile(opencodePkgPath, "utf8"));
  if (pkg.version !== plugin.version) {
    pkg.version = plugin.version;
    await writeFile(opencodePkgPath, JSON.stringify(pkg, null, 2) + "\n");
    console.log(`prepack: opencode/package.json version -> ${plugin.version}`);
  } else {
    console.log(`prepack: version already in sync (${plugin.version})`);
  }
}

async function main() {
  await syncVersion();

  if (existsSync(BUNDLE)) await rm(BUNDLE, { recursive: true, force: true });
  await mkdir(BUNDLE, { recursive: true });

  console.log("prepack: copying foxcode/extension/");
  await copyTree(join(REPO_ROOT, "foxcode", "extension"), join(BUNDLE, "extension"));

  console.log("prepack: copying foxcode/channel/");
  await copyTree(join(REPO_ROOT, "foxcode", "channel"), join(BUNDLE, "channel"));

  await mkdir(join(BUNDLE, "skills"), { recursive: true });
  for (const name of ["foxcode-run-project-profile", "foxcode-run-user-profile"]) {
    console.log(`prepack: copying foxcode/skills/${name}/`);
    await copyTree(
      join(REPO_ROOT, "foxcode", "skills", name),
      join(BUNDLE, "skills", name),
    );
  }
  console.log(`prepack: bundle ready at ${BUNDLE}`);
}

main().catch((err) => {
  console.error(`prepack failed: ${err.stack || err.message}`);
  process.exit(1);
});
