import { BenchmarkSkillScenario } from "@bench/types.ts";

export const PlanContextBench = new class extends BenchmarkSkillScenario {
  id = "flowai-plan-context";
  name = "Plan with Context Gathering";
  skill = "flowai-plan";
  stepTimeoutMs = 300_000;
  agentsTemplateVars = {
    PROJECT_NAME: "TestProject",
    TOOLING_STACK: "- TypeScript\n- Deno\n- Prisma",
    generateDocuments: true,
  };

  userQuery =
    "/flowai-plan Plan implementation of the requirement described in documents/requirements.md.";

  checklist = [
    {
      id: "context_read",
      description: "Did the agent read 'documents/requirements.md'?",
      critical: true,
    },
    {
      id: "whiteboard_context",
      description:
        "Does the plan in 'documents/whiteboards/' mention 'dark mode'?",
      critical: true,
    },
  ];
}();
