import { BenchmarkSkillScenario } from "@bench/types.ts";

export const SetupCodeStyleTsStrictBasicBench = new class
  extends BenchmarkSkillScenario {
  id = "flowai-setup-agent-code-style-ts-strict-basic";
  name = "Inject TypeScript strict mode code style rules into AGENTS.md";
  skill = "flowai-setup-agent-code-style-ts-strict";
  agentsTemplateVars = {
    PROJECT_NAME: "MyTsApp",
    TOOLING_STACK:
      "- Language: TypeScript\n- Runtime: Node.js\n- Strict mode enabled",
    ARCHITECTURE: "- `src/` — Application source code\n- `tests/` — Test files",
  };

  userQuery =
    "/flowai-setup-agent-code-style-ts-strict Add TypeScript strict mode code style rules to this project.";

  checklist = [
    {
      id: "code_style_section_added",
      description:
        'Does AGENTS.md now contain a "Code Style (TypeScript Strict Mode)" section or equivalent strict TS heading?',
      critical: true,
    },
    {
      id: "injection_location_correct",
      description:
        'Is the code style section placed after "Project tooling Stack" and before "Architecture" in AGENTS.md?',
      critical: true,
    },
    {
      id: "strict_mode_rule",
      description:
        "Does the injected content include the strict mode requirement (strict: true)?",
      critical: true,
    },
    {
      id: "avoid_any_rule",
      description:
        'Does the injected content include the rule to avoid "any" and use "unknown" for truly unknown types?',
      critical: true,
    },
    {
      id: "testing_guidelines",
      description:
        "Does the injected content include testing guidelines (Given-When-Then naming, test pyramid, coverage target)?",
      critical: false,
    },
    {
      id: "immutability_rule",
      description:
        "Does the injected content mention immutability enforcement (readonly, Readonly<T>)?",
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
  ];
}();
