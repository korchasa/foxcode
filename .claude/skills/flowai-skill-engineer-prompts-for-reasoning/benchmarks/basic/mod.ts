import { BenchmarkSkillScenario } from "@bench/types.ts";

export const EngineerPromptsForReasoningBench = new class
  extends BenchmarkSkillScenario {
  id = "flowai-skill-engineer-prompts-for-reasoning-basic";
  name = "Write a prompt for a reasoning model to refactor code";
  skill = "flowai-skill-engineer-prompts-for-reasoning";
  agentsTemplateVars = {
    PROJECT_NAME: "SecurityAuditor",
    TOOLING_STACK: "- Python",
  };

  userQuery =
    "/flowai-skill-engineer-prompts-for-reasoning Help me write a prompt for Claude 3.5 Sonnet that analyzes a Python codebase for security vulnerabilities and produces a prioritized report with remediation steps.";

  checklist = [
    {
      id: "uses_structured_context",
      description:
        "Does the generated prompt use structured context with XML-style tags (e.g., <context>, <rules>, <instructions>)?",
      critical: true,
    },
    {
      id: "has_role_section",
      description:
        "Does the prompt define a clear role (e.g., Senior Security Engineer)?",
      critical: true,
    },
    {
      id: "has_goal_or_objective",
      description:
        "Does the prompt include a clear goal or objective section describing what to achieve?",
      critical: true,
    },
    {
      id: "has_instructions_or_steps",
      description:
        "Does the prompt include step-by-step instructions or a plan-first approach?",
      critical: true,
    },
    {
      id: "defines_success_criteria",
      description:
        "Does the prompt define success criteria or what a good output looks like?",
      critical: false,
    },
    {
      id: "has_rules_or_constraints",
      description:
        "Does the prompt include rules or constraints (e.g., prioritization criteria, output format)?",
      critical: false,
    },
  ];
}();
