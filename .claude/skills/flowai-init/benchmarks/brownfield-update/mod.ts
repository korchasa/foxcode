import { join } from "@std/path";
import { BenchmarkSkillScenario } from "@bench/types.ts";

export const InitBrownfieldUpdateBench = new class
  extends BenchmarkSkillScenario {
  id = "flowai-init-brownfield-update";
  name = "Init Brownfield Project Update with Diff Confirmation";
  skill = "flowai-init";
  stepTimeoutMs = 420_000;
  agentsTemplateVars = {
    PROJECT_NAME: "UpdateTestProject",
    TOOLING_STACK: "- Deno\n- TypeScript",
    ARCHITECTURE: "- Monolith",
    KEY_DECISIONS: "- Use Deno for tooling",
  };

  override async setup(sandboxPath: string) {
    // Overwrite template-generated AGENTS.md with custom content containing markers
    // that the checklist verifies are preserved after flowai-init update
    await Deno.writeTextFile(
      join(sandboxPath, "AGENTS.md"),
      [
        "# YOU MUST",
        "",
        "- STRICTLY FOLLOW YOUR ROLE.",
        "- FIRST ACTION IN SESSION: READ ALL PROJECT DOCS. ONE-TIME PER SESSION.",
        "- MY CUSTOM MUST RULE THAT SHOULD SURVIVE",
        "",
        "---",
        "MY PROJECT SPECIFIC RULES",
        "SHOULD BE PRESERVED",
        "",
        "## Project Information",
        "- Project Name: UpdateTestProject",
        "",
        "## Project tooling Stack",
        "- Deno",
        "- TypeScript",
        "",
        "## Architecture",
        "- Monolith",
        "",
        "## Key Decisions",
        "- Use Deno for tooling",
        "",
        "## Planning Rules",
        "",
        "- **Custom Planning Rule**: This was added by the user and should survive updates.",
        "",
        "## TDD FLOW",
        "",
        "1. **RED**: Write test.",
        "2. **GREEN**: Pass test.",
        "",
      ].join("\n"),
    );
  }

  userQuery = "/flowai-init";

  userPersona =
    `You are a developer re-running flowai-init on an existing project that already has all AGENTS.md files.
When the agent detects existing components, tell it to 'update existing files'.
When shown diffs for AGENTS.md files, confirm applying the changes (say 'yes').
When asked about other actions, confirm them.
You want the framework template updates but also want your custom content preserved.`;

  checklist = [
    {
      id: "diff_shown_root",
      description:
        "Did the agent show a diff or proposed changes for the root AGENTS.md before applying?",
      critical: true,
    },
    {
      id: "diff_shown_documents",
      description:
        "Did the agent show a diff or proposed changes for documents/AGENTS.md before applying?",
      critical: true,
    },
    {
      id: "project_rules_preserved",
      description:
        "Were the project-specific rules between --- markers preserved in AGENTS.md (contains 'MY PROJECT SPECIFIC RULES')?",
      critical: true,
    },
    {
      id: "user_confirmation_requested",
      description:
        "Did the agent ask for user confirmation before applying changes to each file?",
      critical: true,
    },
    {
      id: "three_files_handled",
      description:
        "Did the agent handle all 3 AGENTS.md files (root, documents/, scripts/)?",
      critical: true,
    },
  ];
}();
