import { BenchmarkSkillScenario } from "@bench/types.ts";

export const AnalyzeContextBasicBench = new class
  extends BenchmarkSkillScenario {
  id = "flowai-skill-analyze-context-basic";
  name = "Analyze conversation context token usage";
  skill = "flowai-skill-analyze-context";
  agentsTemplateVars = {
    PROJECT_NAME: "SampleProject",
    TOOLING_STACK: "- TypeScript\n- Deno",
    ARCHITECTURE:
      "- `src/` — Application source code\n- `scripts/` — Utility scripts",
    KEY_DECISIONS: "- Use Deno for all tooling\n- Follow TDD workflow",
  };

  userQuery =
    "/flowai-skill-analyze-context How many tokens are we using in this conversation? Give me a full breakdown.";

  checklist = [
    {
      id: "conversation_tokens_estimated",
      description:
        "Did the agent provide a token estimate for the conversation history (user and assistant messages)?",
      critical: true,
    },
    {
      id: "system_context_estimated",
      description:
        "Did the agent estimate tokens for system context (AGENTS.md, rules, system prompts)?",
      critical: true,
    },
    {
      id: "overhead_estimated",
      description:
        "Did the agent account for tool/skill definitions overhead in the estimate?",
      critical: false,
    },
    {
      id: "total_provided",
      description:
        "Did the agent provide a total token count summing all components?",
      critical: true,
    },
    {
      id: "breakdown_structured",
      description:
        "Is the output a structured breakdown with separate line items for each context component (not just a single number)?",
      critical: true,
    },
    {
      id: "multiplier_used",
      description:
        "Did the agent use a character-to-token multiplier (approximately 0.3 or ~1 token per 3-4 characters) or a token counting tool?",
      critical: false,
    },
  ];
}();
