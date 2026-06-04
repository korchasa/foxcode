#!/usr/bin/env node
/**
 * foxcode-opencode CLI — one-shot installer for OpenCode users who
 * prefer a single command over the plugin auto-bootstrap.
 *
 * Subcommands:
 *   setup [--write-config]   Seed skills and print MCP snippet.
 *                            With --write-config, also patch opencode.json
 *                            (refuses files containing JSONC comments).
 *   uninstall                Remove seeded skill symlinks.
 *                            Does NOT auto-remove mcp.foxcode from opencode.json.
 *   doctor                   Diagnostics: prereqs, paths, config state.
 */
import { join } from "node:path";
import { existsSync, lstatSync, unlinkSync } from "node:fs";

import { resolveFromModule, bundlePaths, userSkillsDir, userOpencodeJson } from "../lib/paths.mjs";
import { runSetup } from "../lib/setup.mjs";
import { buildMcpSnippet, findConfigWithFoxcode } from "../lib/mcp-snippet.mjs";
import { checkPrereqs } from "../lib/prereq.mjs";

const PLUGIN_ROOT = resolveFromModule(import.meta.url, "..");
const PATHS = bundlePaths(PLUGIN_ROOT);

function printSetupReport(r, writeConfig) {
  console.log(`Plugin root: ${r.pluginRoot} (artefacts: ${r.paths.source})`);
  if (!r.prereq.ok) {
    for (const p of r.prereq.problems) console.error(`error: ${p}`);
    return;
  }
  for (const [name, action] of Object.entries(r.skills)) {
    console.log(`  skill ${name}: ${action}`);
  }
  if (writeConfig) {
    console.log(`  opencode.json (${r.configTarget}): ${r.configAction}`);
  } else if (r.configFound) {
    console.log(`  opencode.json: mcp.foxcode already present in ${r.configFound}`);
  } else {
    console.log("\nAdd the following to opencode.json (rerun OpenCode after):\n");
    console.log(buildMcpSnippet());
  }
}

async function cmdSetup(args) {
  const writeConfig = args.includes("--write-config");
  const report = await runSetup({
    pluginRoot: PLUGIN_ROOT,
    project: process.cwd(),
    writeConfig,
  });
  printSetupReport(report, writeConfig);
  return report.prereq.ok ? 0 : 1;
}

async function cmdUninstall() {
  const skillsDir = userSkillsDir();
  for (const name of ["foxcode-run-project-profile", "foxcode-run-user-profile"]) {
    const link = join(skillsDir, name);
    if (existsSync(link)) {
      try {
        const info = lstatSync(link);
        if (info.isSymbolicLink()) {
          unlinkSync(link);
          console.log(`  removed symlink: ${link}`);
        } else {
          console.log(`  skipped (not a symlink, user content preserved): ${link}`);
        }
      } catch (err) {
        console.error(`  error inspecting ${link}: ${err.message}`);
      }
    }
  }
  console.log(
    "\nNote: mcp.foxcode is NOT auto-removed from opencode.json. " +
    "Remove it manually if you want a complete uninstall.",
  );
  return 0;
}

async function cmdDoctor() {
  const prereq = await checkPrereqs();
  console.log(`Prereqs: ${prereq.ok ? "ok" : "FAIL"}`);
  for (const p of prereq.problems) console.log(`  - ${p}`);
  console.log(`Plugin root:    ${PLUGIN_ROOT} (${PATHS.source})`);
  console.log(`Bundle skills:  ${PATHS.skills}`);
  console.log(`Channel:        resolved via npx (foxcode-channel@<pin>; see opencode.json)`);
  console.log(`User skills:    ${userSkillsDir()}`);
  const found = await findConfigWithFoxcode([
    join(process.cwd(), "opencode.json"),
    userOpencodeJson(),
  ]).catch((err) => `(error: ${err.message})`);
  console.log(`mcp.foxcode in: ${found ?? "(not configured)"}`);
  return prereq.ok ? 0 : 1;
}

function usage() {
  process.stdout.write(
    "Usage: foxcode-opencode <command>\n" +
    "  setup [--write-config]   Seed skills + emit MCP snippet (or patch opencode.json)\n" +
    "  uninstall                Remove seeded symlinks\n" +
    "  doctor                   Diagnostics\n",
  );
}

async function main(argv) {
  const [, , cmd, ...rest] = argv;
  switch (cmd) {
    case "setup":     return await cmdSetup(rest);
    case "uninstall": return await cmdUninstall();
    case "doctor":    return await cmdDoctor();
    case "--help":
    case "-h":
    case undefined:
      usage();
      return 0;
    default:
      console.error(`Unknown command: ${cmd}`);
      usage();
      return 2;
  }
}

const code = await main(process.argv).catch((err) => {
  console.error(`fatal: ${err.stack || err.message || err}`);
  return 1;
});
process.exit(code);
