import { join } from "@std/path";
import { BenchmarkSkillScenario } from "@bench/types.ts";
import { runGit } from "@bench/utils.ts";

/**
 * Tests that flowai-update adapts skills to the project after sync.
 *
 * Scenario:
 * 1. Project uses Python + pytest (visible in AGENTS.md)
 * 2. flowai-commit skill is installed with generic Deno examples
 * 3. flowai sync brings a new version of flowai-commit (adds a new rule)
 * 4. Agent should detect the upstream change, adapt the skill to Python/pytest
 *
 * The skill was previously adapted (HEAD has Python references).
 * After sync, the upstream version overwrites it (generic examples).
 * Agent must merge: keep Python adaptations + incorporate new upstream rule.
 */
export const FlowUpdateSkillAdaptationBench = new class
  extends BenchmarkSkillScenario {
  id = "flowai-update-skill-adaptation";
  name = "Adapt updated skills to project specifics after sync";
  skill = "flowai-update";
  stepTimeoutMs = 300_000;

  maxSteps = 25;

  agentsTemplateVars = {
    PROJECT_NAME: "MyPythonProject",
    TOOLING_STACK: "- Python 3.12, pytest, ruff, poetry",
    ARCHITECTURE:
      "- `src/` — application code\n- `tests/` — pytest test files\n- `pyproject.toml` — project config",
  };

  // Mock flowai that reports skills updated
  mocks: Record<string, string> = {
    flowai: `#!/bin/bash
if [ "$1" = "sync" ]; then
  echo "Target IDEs: claude"
  echo "Loading framework files..."
  echo "Packs: core"
  echo "Skills to sync: flowai-commit"
  echo ""
  echo "Syncing to claude..."
  echo "  Conflicts: 1"
  echo ""
  echo "Sync complete:"
  echo "  Written: 1"
  echo "  Conflicts resolved: 1"
  echo ""
  echo ">>> ACTIONS REQUIRED:"
  echo "1. SKILLS UPDATED: flowai-commit"
  exit 0
elif [ "$1" = "--version" ]; then
  echo "flowai 0.4.0"
  exit 0
else
  echo "IDE context detected."
  exit 0
fi
`,
  };

  override sandboxState = {
    commits: [
      {
        message: "Previous sync with adapted skills",
        files: [
          ".flowai.yaml",
          ".claude/skills/flowai-commit/SKILL.md",
        ],
      },
    ],
    modified: [".claude/skills/flowai-commit/SKILL.md"],
    expectedOutcome:
      "Agent detects upstream skill update, merges new rule (sign-off) while preserving Python/pytest adaptations",
  };

  override async setup(sandboxPath: string) {
    // Create .flowai.yaml
    await Deno.writeTextFile(
      join(sandboxPath, ".flowai.yaml"),
      'version: "1.1"\nides:\n  - claude\npacks:\n  - core\n',
    );

    // Create .claude/skills/flowai-commit/ with previously adapted version
    const skillDir = join(sandboxPath, ".claude", "skills", "flowai-commit");
    await Deno.mkdir(skillDir, { recursive: true });

    // "Previous" version: adapted for Python project (no adapted frontmatter — git tracks this)
    const adaptedSkill = `---
name: flowai-commit
description: Commit workflow
---

# Task: Commit Changes

## Rules
1. Run tests before committing: \`poetry run pytest\`
2. Run linter: \`ruff check .\`
3. Write conventional commit messages

## Steps
1. Check test results: \`poetry run pytest\`
2. Stage changes
3. Write commit message
`;
    await Deno.writeTextFile(join(skillDir, "SKILL.md"), adaptedSkill);

    // Commit as baseline (previous sync + adaptation)
    await runGit(sandboxPath, ["add", "-A"]);
    await runGit(sandboxPath, [
      "commit",
      "-m",
      "Previous sync with adapted skills",
    ]);

    // Now simulate flowai sync overwriting with new upstream version
    // New upstream: adds rule about "sign-off" but uses generic Deno examples
    const newUpstreamSkill = `---
name: flowai-commit
description: Commit workflow
---

# Task: Commit Changes

## Rules
1. Run tests before committing: \`deno test\`
2. Run linter: \`deno lint\`
3. Write conventional commit messages
4. Add sign-off line to commit messages

## Steps
1. Check test results: \`deno test\`
2. Run formatter: \`deno fmt\`
3. Stage changes
4. Write commit message with sign-off
`;
    await Deno.writeTextFile(join(skillDir, "SKILL.md"), newUpstreamSkill);

    // Now working tree has upstream version, HEAD has project-adapted version
    // Agent should detect this via git diff and merge
  }

  userQuery =
    "/flowai-update I already ran `flowai sync -y` and it updated skills. Skip CLI update and sync steps — start from parsing sync output and adapting the updated skills to my project.";

  checklist = [
    {
      id: "detected_skill_change",
      description:
        "Did the agent detect that flowai-commit skill was updated (via git diff or git status)?",
      critical: true,
    },
    {
      id: "read_previous_version",
      description:
        "Did the agent read the previous version from HEAD (via git show or git diff) to understand project-specific adaptations?",
      critical: true,
    },
    {
      id: "preserved_python_commands",
      description:
        "Did the agent keep Python/pytest commands (poetry run pytest, ruff) instead of generic Deno commands in the result?",
      critical: true,
    },
    {
      id: "incorporated_new_rule",
      description:
        "Did the agent incorporate the new upstream rule (sign-off line in commits) into the skill?",
      critical: true,
    },
    {
      id: "showed_diff_before_applying",
      description:
        "Did the agent show the proposed changes to the user before applying them?",
      critical: true,
    },
    {
      id: "used_subagent",
      description:
        "Did the agent use a subagent (skill-adapter or similar) for skill adaptation?",
      critical: false,
    },
  ];
}();
