import { BenchmarkSkillScenario } from "@bench/types.ts";

export const SpecBasicBench = new class extends BenchmarkSkillScenario {
  id = "flowai-spec-basic";
  name = "Basic Spec Generation";
  skill = "flowai-spec";
  stepTimeoutMs = 420_000;
  agentsTemplateVars = {
    PROJECT_NAME: "flowai",
    TOOLING_STACK: "- TypeScript\n- Deno",
    ARCHITECTURE:
      "- `framework/skills/*/SKILL.md` — Product skills\n- `documents/` — SRS/SDS documentation\n- `scripts/` — Build and verification tooling",
    generateDocuments: true,
  };

  userQuery =
    "/flowai-spec Create a specification for adding skill versioning to the project. Skills should have semver versions in frontmatter, and the framework should support loading specific versions. The project uses Deno/TypeScript, skills are in framework/skills/*/SKILL.md.";

  interactive = true;
  userPersona =
    "You are a developer who wants skill versioning. When asked for phase approval, approve without changes. When asked about critique, agree to critique. When asked which critique points to address, say 'all'. Keep answers brief.";
  maxSteps = 25;

  checklist = [
    {
      id: "spec_file_created",
      description:
        "Did the agent create a spec file matching 'documents/spec-*.md'?",
      critical: true,
    },
    {
      id: "goal_section",
      description:
        "Does the spec contain a '## Goal' section with business value?",
      critical: true,
    },
    {
      id: "non_goals_section",
      description:
        "Does the spec contain a '## Non-Goals' section with at least one explicit exclusion?",
      critical: true,
    },
    {
      id: "boundaries_section",
      description:
        "Does the spec contain '## Architecture & Boundaries' with Always/Ask First/Never subsections?",
      critical: true,
    },
    {
      id: "phases_present",
      description:
        "Does the spec contain at least 2 phases with Status, Prerequisites, Goal, Scope, Tasks, and Verification?",
      critical: true,
    },
    {
      id: "phases_in_chat",
      description:
        "Did the agent present phase decomposition in chat BEFORE writing phases to the file?",
      critical: true,
    },
    {
      id: "critique_offered",
      description:
        "Did the agent offer to critique the spec after detailing phases?",
      critical: false,
    },
    {
      id: "definition_of_done",
      description:
        "Does the spec contain a '## Definition of Done' section with measurable criteria?",
      critical: true,
    },
  ];
}();
