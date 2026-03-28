import { BenchmarkSkillScenario } from "@bench/types.ts";

export const SetupCodeStyleTsDenoBasicBench = new class
  extends BenchmarkSkillScenario {
  id = "flowai-setup-agent-code-style-ts-deno-basic";
  name = "Inject Deno/TS code style rules into AGENTS.md";
  skill = "flowai-setup-agent-code-style-ts-deno";
  stepTimeoutMs = 300_000;
  agentsTemplateVars = {
    PROJECT_NAME: "MyDenoApp",
    TOOLING_STACK: "- Language: TypeScript\n- Runtime: Deno",
    ARCHITECTURE:
      "- `src/` — Application source code\n- `scripts/` — Build and utility scripts",
  };

  userQuery =
    "/flowai-setup-agent-code-style-ts-deno Add Deno TypeScript code style rules to this project.";

  checklist = [
    {
      id: "code_style_section_added",
      description:
        'Does AGENTS.md now contain a "Code Style (Deno + TypeScript)" section or equivalent Deno code style heading?',
      critical: true,
    },
    {
      id: "injection_location_correct",
      description:
        'Is the code style section placed after "Project tooling Stack" and before "Architecture" in AGENTS.md?',
      critical: true,
    },
    {
      id: "bare_specifiers_rule",
      description:
        "Does the injected content include the rule about using bare specifiers for dependencies defined in deno.json/imports?",
      critical: true,
    },
    {
      id: "dockerfile_optimization_rule",
      description:
        "Does the injected content include Dockerfile optimization guidance (deno compile, multi-stage builds)?",
      critical: false,
    },
    {
      id: "no_duplicate_sections",
      description:
        'Is there only one "Code Style" section in AGENTS.md (no duplicates)?',
      critical: true,
    },
    {
      id: "existing_content_preserved",
      description:
        "Are the original AGENTS.md sections (Project tooling Stack, Architecture) still present and unmodified?",
      critical: true,
    },
    {
      id: "valid_markdown",
      description:
        "Is the resulting AGENTS.md valid markdown with proper heading hierarchy?",
      critical: false,
    },
  ];
}();
