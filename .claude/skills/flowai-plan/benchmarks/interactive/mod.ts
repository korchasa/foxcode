import { BenchmarkSkillScenario } from "@bench/types.ts";

export const PlanInteractiveBench = new class extends BenchmarkSkillScenario {
  id = "flowai-plan-interactive";
  name = "Plan with Interactive Variant Selection";
  skill = "flowai-plan";
  stepTimeoutMs = 300_000;
  agentsTemplateVars = {
    PROJECT_NAME: "TestProject",
    TOOLING_STACK: "- TypeScript\n- Deno",
    generateDocuments: true,
  };

  userQuery = "/flowai-plan Plan a simple CLI tool that prints 'Hello World'.";

  userPersona = `You are a developer who always picks the simplest option.
IMPORTANT: The agent speaks Russian. When you see a question ending with '?' or asking you to choose (e.g. 'Какой вариант', 'выбираете', 'предпочитаете', 'подтвердите'), you MUST respond.
When asked to choose between variants, always respond with exactly: 'I choose variant A (the simplest one). Please update the whiteboard file with the Solution section now.'
When asked for confirmation, always respond with: 'Yes, confirmed. Please proceed and fill the Solution section in the whiteboard.'`;

  interactive = true;

  checklist = [
    {
      id: "variants_presented",
      description: "Did the agent present implementation variants in the chat?",
      critical: true,
    },
    {
      id: "question_asked",
      description:
        "Did the agent ask the user to select an implementation variant?",
      critical: true,
    },
    {
      id: "solution_filled",
      description:
        "Check the 'Solution' section in the whiteboard file in 'documents/whiteboards/'. It MUST contain concrete technical implementation details (not a placeholder, not a comment like '<!-- ... -->', not '_To be filled..._'). If the Solution section is empty, contains only a placeholder comment, or says 'to be filled', this check FAILS.",
      critical: true,
    },
    {
      id: "no_switch_mode",
      description: "Did the logs NOT contain 'SwitchMode'?",
      critical: true,
    },
  ];
}();
