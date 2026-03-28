import { join } from "@std/path";
import { BenchmarkSkillScenario } from "@bench/types.ts";
import { runGit } from "@bench/utils.ts";

/**
 * Tests that the agent compares templates against actual project artifacts,
 * not just analyzes `git diff` of template files vs their own HEAD.
 *
 * Reproduces a real failure mode: when many skill files change (mostly
 * formatting), the agent runs `git diff` on `.claude/skills/`, sees
 * "mostly formatting noise", concludes "no migration needed" — without
 * ever reading the actual project artifact (AGENTS.md) to compare.
 *
 * Scenario setup:
 * 1. Three templates changed (AGENTS.template.md, AGENTS.documents.template.md,
 *    AGENTS.scripts.template.md) — all with formatting noise
 * 2. Several other skill SKILL.md files changed — formatting only (noise)
 * 3. ONE substantive change hidden in AGENTS.template.md: new "Proactive
 *    Resolution" planning rule
 * 4. Project AGENTS.md is missing that rule
 * 5. Agent must NOT dismiss everything as formatting — must compare
 *    templates against artifacts to find the gap
 */
export const FlowUpdateTemplateVsArtifactBench = new class
  extends BenchmarkSkillScenario {
  id = "flowai-update-template-vs-artifact";
  name =
    "Compares templates against project artifacts (not just template git diff)";
  skill = "flowai-update";
  stepTimeoutMs = 300_000;

  maxSteps = 25;

  agentsTemplateVars = {
    PROJECT_NAME: "MyProject",
    TOOLING_STACK: "- TypeScript\n- Deno",
  };

  override sandboxState = {
    commits: [
      {
        message: "Initial sync (baseline)",
        files: [
          "documents/AGENTS.md",
          "scripts/AGENTS.md",
          ".claude/skills/flowai-init/assets/AGENTS.template.md",
          ".claude/skills/flowai-init/assets/AGENTS.documents.template.md",
          ".claude/skills/flowai-init/assets/AGENTS.scripts.template.md",
          ".claude/skills/flowai-reflect/SKILL.md",
          ".claude/skills/flowai-review/SKILL.md",
          ".claude/skills/flowai-commit/SKILL.md",
        ],
      },
    ],
    modified: [
      ".claude/skills/flowai-init/assets/AGENTS.template.md",
      ".claude/skills/flowai-init/assets/AGENTS.documents.template.md",
      ".claude/skills/flowai-init/assets/AGENTS.scripts.template.md",
      ".claude/skills/flowai-reflect/SKILL.md",
      ".claude/skills/flowai-review/SKILL.md",
      ".claude/skills/flowai-commit/SKILL.md",
    ],
    expectedOutcome:
      "Agent compares templates against project artifacts (not just git diff), finds missing Proactive Resolution rule in AGENTS.md, proposes adding it",
  };

  override async setup(sandboxPath: string) {
    // Overwrite template-generated AGENTS.md with version MISSING "Proactive Resolution"
    // so the agent must compare templates vs artifacts to find the gap
    await Deno.writeTextFile(
      join(sandboxPath, "AGENTS.md"),
      [
        "# MyProject",
        "",
        "## Project tooling Stack",
        "- TypeScript, Deno",
        "",
        "## Planning Rules",
        "",
        "- **Environment Side-Effects**: Changes to infra/DB/external services → plan MUST include migration/sync/deploy steps.",
        "- **Verification Steps**: Plan MUST include specific verification commands (tests, validation tools, connectivity checks).",
        "- **Functionality Preservation**: Refactoring/modifications → run existing tests before/after; add new tests if coverage missing.",
        "- **Data-First**: Integration with external APIs/processes → inspect protocol & data formats BEFORE planning.",
        "- **Architectural Validation**: Complex logic changes → visualize event sequence (sequence diagram/pseudocode).",
        "- **Variant Analysis**: Non-obvious path → propose variants with Pros/Cons/Risks per variant + Trade-offs across variants. Quality > quantity. 1 variant OK if path is clear.",
        "- **User Decision Gate**: Do NOT detail implementation plan until user explicitly selects a variant.",
        "- **Plan Persistence**: After variant selection, save the detailed plan to documents/whiteboards/<date>-<slug>.md using GODS format. Chat-only plans are lost between sessions.",
        "",
        "## TDD FLOW",
        "",
        "1. **RED**: Write test for new/changed logic or behavior.",
        "2. **GREEN**: Pass test.",
        "3. **REFACTOR**: Improve code/tests. No behavior change.",
        "4. **CHECK**: Run check command. Fix all.",
        "",
      ].join("\n"),
    );

    // --- Create project artifacts ---
    // documents/AGENTS.md (matches template — no migration needed)
    const docsDir = join(sandboxPath, "documents");
    await Deno.mkdir(docsDir, { recursive: true });
    await Deno.writeTextFile(
      join(docsDir, "AGENTS.md"),
      `# Documentation Rules

**CRITICAL:** MEMORY RESETS. DOCS = ONLY LINK TO PAST. MAINTAIN ACCURACY.

## Hierarchy
1. **\`AGENTS.md\`**: "Why" & "For Whom". Long-term goal/value. READ-ONLY.
2. **SRS** (\`documents/requirements.md\`): "What" & "Why". Source of truth.
3. **SDS** (\`documents/design.md\`): "How". Implementation details.
4. **Whiteboards** (\`documents/whiteboards/<YYYY-MM-DD>-<slug>.md\`): Temporary plans/notes.

## Rules
- **STRICT COMPLIANCE**: AGENTS.md, SRS, SDS.
- **Workflow**: New/Updated req -> Update SRS -> Update SDS -> Implement.
`,
    );

    // scripts/AGENTS.md (matches template — no migration needed)
    const scriptsDir = join(sandboxPath, "scripts");
    await Deno.mkdir(scriptsDir, { recursive: true });
    await Deno.writeTextFile(
      join(scriptsDir, "AGENTS.md"),
      `# Development Commands

## Shell Environment
- All project scripts auto-detect AI agent environments.

## Standard Interface
- \`check\` - Comprehensive project verification.
- \`test <path>\` - Runs a single test.
- \`dev\` - Development mode with watch.
`,
    );

    // --- Prepare "old" template versions (baseline) ---
    const skillsBase = join(sandboxPath, ".claude", "skills");

    // 1. AGENTS.template.md — remove "Proactive Resolution" + add formatting noise
    const mainTemplatePath = join(
      skillsBase,
      "flowai-init",
      "assets",
      "AGENTS.template.md",
    );
    const newMainTemplate = await Deno.readTextFile(mainTemplatePath);
    const oldMainTemplate = newMainTemplate
      .split("\n")
      .filter((line) => !line.includes("Proactive Resolution"))
      .join("\n")
      .replace("## Planning Rules\n", "## Planning Rules\n\n")
      .replace("## Project Information\n", "\n## Project Information\n\n")
      .replace("## Key Decisions\n", "\n## Key Decisions\n\n");

    // 2. AGENTS.documents.template.md — formatting-only changes
    const docsTemplatePath = join(
      skillsBase,
      "flowai-init",
      "assets",
      "AGENTS.documents.template.md",
    );
    const newDocsTemplate = await Deno.readTextFile(docsTemplatePath);
    const oldDocsTemplate = newDocsTemplate
      .replace("## Hierarchy\n", "## Hierarchy\n\n")
      .replace("## Rules\n", "\n## Rules\n\n")
      .replace(
        "## Compressed Style Rules (All Docs)\n",
        "\n## Compressed Style Rules (All Docs)\n\n",
      );

    // 3. AGENTS.scripts.template.md — formatting-only changes
    const scriptsTemplatePath = join(
      skillsBase,
      "flowai-init",
      "assets",
      "AGENTS.scripts.template.md",
    );
    const newScriptsTemplate = await Deno.readTextFile(scriptsTemplatePath);
    const oldScriptsTemplate = newScriptsTemplate
      .replace("## Standard Interface\n", "\n## Standard Interface\n\n")
      .replace("## Detected Commands\n", "\n## Detected Commands\n\n");

    // 4. Create additional formatting-only noise in other skills
    const noisySkills = [
      "flowai-reflect",
      "flowai-review",
      "flowai-commit",
    ];
    const noisyOldVersions: Map<string, { path: string; newContent: string }> =
      new Map();

    for (const skill of noisySkills) {
      const skillPath = join(skillsBase, skill, "SKILL.md");
      try {
        const content = await Deno.readTextFile(skillPath);
        noisyOldVersions.set(skill, { path: skillPath, newContent: content });
        // Add formatting noise: extra blank lines
        const oldContent = content
          .replace(/## Overview\n/g, "\n## Overview\n\n")
          .replace(/## Context\n/g, "\n## Context\n\n")
          .replace(/## Rules/g, "\n## Rules");
        await Deno.writeTextFile(skillPath, oldContent);
      } catch {
        // Skill doesn't exist in sandbox — skip
      }
    }

    // Write old versions of all templates
    await Deno.writeTextFile(mainTemplatePath, oldMainTemplate);
    await Deno.writeTextFile(docsTemplatePath, oldDocsTemplate);
    await Deno.writeTextFile(scriptsTemplatePath, oldScriptsTemplate);

    // Commit everything as "previous sync" baseline
    await runGit(sandboxPath, ["add", "-A"]);
    await runGit(sandboxPath, ["commit", "-m", "Initial sync (baseline)"]);

    // --- Restore "new" versions (simulate flowai sync) ---
    await Deno.writeTextFile(mainTemplatePath, newMainTemplate);
    await Deno.writeTextFile(docsTemplatePath, newDocsTemplate);
    await Deno.writeTextFile(scriptsTemplatePath, newScriptsTemplate);

    for (const [, { path, newContent }] of noisyOldVersions) {
      await Deno.writeTextFile(path, newContent);
    }

    // Now `git status` shows ~6 changed files, `git diff` is mostly formatting.
    // Only AGENTS.template.md has a substantive change (new planning rule).
    // Agent must compare templates vs project artifacts to find the gap.
  }

  userQuery =
    "/flowai-update I already ran `flowai sync` and it updated some skills. Please skip the CLI update and sync steps. Start from step 3: detect what changed in .claude/ via git, analyze diffs, compare templates against project artifacts, and propose migrations.";

  checklist = [
    {
      id: "detected_multiple_changes",
      description:
        "Did the agent detect multiple changed files in `.claude/skills/` (not just one template)?",
      critical: true,
    },
    {
      id: "read_project_agents_md",
      description:
        "Did the agent read the actual project `AGENTS.md` file (not just the template diff) to compare against the template?",
      critical: true,
    },
    {
      id: "found_missing_proactive_resolution",
      description:
        'Did the agent identify that the project `AGENTS.md` is missing the "Proactive Resolution" planning rule that exists in the template?',
      critical: true,
    },
    {
      id: "proposed_adding_rule",
      description:
        'Did the agent propose adding the "Proactive Resolution" rule to the project\'s Planning Rules section in AGENTS.md?',
      critical: true,
    },
    {
      id: "not_dismissed_as_formatting",
      description:
        'Did the agent NOT dismiss all changes as "just formatting" or "cosmetic only — no migration needed" without comparing templates to project artifacts?',
      critical: true,
    },
    {
      id: "checked_documents_agents_md",
      description:
        "Did the agent also check `documents/AGENTS.md` against its template (AGENTS.documents.template.md)?",
      critical: false,
    },
    {
      id: "correctly_no_migration_for_docs",
      description:
        "Did the agent correctly determine that `documents/AGENTS.md` and `scripts/AGENTS.md` do NOT need migration (they already match)?",
      critical: false,
    },
  ];
}();
