import { existsSync } from "node:fs";
import { join } from "node:path";

import { bundlePaths, channelServerPath, userSkillsDir, handoffFilePath, userOpencodeJson } from "./paths.mjs";
import { seedSkills } from "./seed-skills.mjs";
import { writeHandoff } from "./handoff.mjs";
import { ensureChannelDeps } from "./lazy-install.mjs";
import { findConfigWithFoxcode } from "./mcp-snippet.mjs";
import { patchOpencodeJson } from "./patcher.mjs";
import { checkPrereqs } from "./prereq.mjs";

/**
 * Pure setup orchestration. Performs every install action and returns a
 * structured report. No console output, no process-level side effects
 * beyond filesystem mutation. CLI and plugin layers print whatever fields
 * of the report they want.
 *
 * Inputs:
 *   pluginRoot   — absolute path to the package root
 *   project      — process.cwd() at the time of invocation
 *   writeConfig  — when true, patch opencode.json with mcp.foxcode entry
 *
 * Outputs:
 *   { prereq, paths, skills, handoff, channelDeps, configAction, configFound,
 *     channelServer }
 *
 * Throws only when prereqs themselves cannot be evaluated. All other
 * branches surface as fields on the report so the caller can decide
 * whether to exit non-zero.
 */
export async function runSetup({ pluginRoot, project, writeConfig }) {
  const paths = bundlePaths(pluginRoot);
  const channelServer = channelServerPath(pluginRoot);

  const prereq = await checkPrereqs();
  const report = {
    pluginRoot,
    paths,
    channelServer,
    prereq,
    skills: null,
    handoff: null,
    channelDeps: null,
    configAction: null,
    configFound: null,
  };
  if (!prereq.ok) return report;

  report.skills = await seedSkills({
    bundleSkillsDir: paths.skills,
    userSkillsDir: userSkillsDir(),
  });
  await writeHandoff(handoffFilePath(), pluginRoot);
  report.handoff = handoffFilePath();
  report.channelDeps = await ensureChannelDeps(paths.channel);

  if (writeConfig) {
    const target = existsSync(join(project, "opencode.json"))
      ? join(project, "opencode.json")
      : userOpencodeJson();
    report.configAction = await patchOpencodeJson(target, channelServer);
    report.configTarget = target;
  } else {
    report.configFound = await findConfigWithFoxcode([
      join(project, "opencode.json"),
      userOpencodeJson(),
    ]);
  }
  return report;
}
