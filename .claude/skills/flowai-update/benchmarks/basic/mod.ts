import { join } from "@std/path";
import { BenchmarkSkillScenario } from "@bench/types.ts";
import { runGit } from "@bench/utils.ts";

/**
 * Simulates a framework update where flowai-init's AGENTS.template.md gained a CHECK step.
 *
 * Runner sequence: copy fixtures → copy framework → write AGENTS.md → setup().
 * In setup(), .claude/ already contains the full framework.
 *
 * Strategy:
 * 1. Read real AGENTS.template.md from .claude/skills/flowai-init/assets/
 * 2. Create an "old" version by stripping the CHECK step
 * 3. Commit everything (old template = baseline, "previous sync")
 * 4. Restore real version → only this template shows as modified in git
 * 5. Agent detects change, maps flowai-init → AGENTS.md, proposes adding CHECK step
 */
export const FlowUpdateBasicBench = new class extends BenchmarkSkillScenario {
  id = "flowai-update-basic";
  name = "Detect framework changes and propose AGENTS.md migration";
  skill = "flowai-update";
  stepTimeoutMs = 300_000;

  maxSteps = 20;

  agentsTemplateVars = {
    PROJECT_NAME: "MyProject",
    TOOLING_STACK: "- TypeScript\n- Deno",
    KEY_DECISIONS: "- Save plans to documents/whiteboards/",
  };

  override sandboxState = {
    commits: [
      {
        message: "Initial sync (baseline)",
        files: [".claude/skills/flowai-init/assets/AGENTS.template.md"],
      },
    ],
    modified: [".claude/skills/flowai-init/assets/AGENTS.template.md"],
    expectedOutcome:
      "Agent detects template change, maps flowai-init to AGENTS.md, proposes adding CHECK step to TDD Flow section",
  };

  override async setup(sandboxPath: string) {
    // Overwrite template-generated AGENTS.md with outdated version (3-step TDD, no CHECK)
    // so the agent can detect the gap and propose adding CHECK
    await Deno.writeTextFile(
      join(sandboxPath, "AGENTS.md"),
      [
        "# MyProject",
        "",
        "## Project tooling Stack",
        "- TypeScript, Deno",
        "",
        "## TDD FLOW",
        "",
        "1. **RED**: Write test for new/changed logic or behavior.",
        "2. **GREEN**: Pass test.",
        "3. **REFACTOR**: Improve code/tests. No behavior change.",
        "",
        "## Planning Rules",
        "- Save plans to documents/whiteboards/",
        "",
      ].join("\n"),
    );

    // Runner has already copied framework to .claude/ and written AGENTS.md
    const templatePath = join(
      sandboxPath,
      ".claude",
      "skills",
      "flowai-init",
      "assets",
      "AGENTS.template.md",
    );

    // Save the current (new) template content
    const newContent = await Deno.readTextFile(templatePath);

    // Create "old" version by removing the CHECK step line
    const oldContent = removeCheckStep(newContent);

    // Write old version as baseline
    await Deno.writeTextFile(templatePath, oldContent);

    // Commit everything as "previous sync" baseline
    await runGit(sandboxPath, ["add", "-A"]);
    await runGit(sandboxPath, ["commit", "-m", "Initial sync (baseline)"]);

    // Restore real (new) version — simulates "flowai sync" bringing updates
    await Deno.writeTextFile(templatePath, newContent);

    // Now only .claude/skills/flowai-init/assets/AGENTS.template.md is modified
  }

  userQuery =
    "/flowai-update I already ran `flowai sync` and it updated some skills. Please skip the sync step and start from step 2: detect what changed in .claude/ via git, then migrate my project artifacts.";

  checklist = [
    {
      id: "detected_skill_change",
      description:
        "Did the agent detect that a file in `.claude/skills/flowai-init/` has changed (via git status or git diff)?",
      critical: true,
    },
    {
      id: "identified_agents_md",
      description:
        "Did the agent identify `AGENTS.md` as an artifact affected by the flowai-init change?",
      critical: true,
    },
    {
      id: "proposed_tdd_update",
      description:
        "Did the agent propose updating the TDD Flow section in AGENTS.md to add a 4th step — CHECK (running check command, or formatter + linter + tests)?",
      critical: true,
    },
    {
      id: "showed_diff_or_change",
      description:
        "Did the agent show the proposed change (diff, before/after, or explanation) before applying?",
      critical: true,
    },
    {
      id: "preserved_project_content",
      description:
        "Did the agent preserve the project-specific content in AGENTS.md (project name 'MyProject', stack 'TypeScript, Deno', planning rules)?",
      critical: true,
    },
    {
      id: "explained_why",
      description:
        "Did the agent explain WHY the change is recommended (e.g., new CHECK step ensures code quality)?",
      critical: false,
    },
  ];
}();

/** Remove the line containing **CHECK** from content */
function removeCheckStep(content: string): string {
  return content
    .split("\n")
    .filter((line) => !/\*\*CHECK\*\*/i.test(line))
    .join("\n");
}
