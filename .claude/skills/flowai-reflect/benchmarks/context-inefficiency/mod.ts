import { BenchmarkSkillScenario } from "@bench/types.ts";

export const ReflectContextBench = new class extends BenchmarkSkillScenario {
  id = "flowai-reflect-context";
  name = "Reflect on Context Inefficiency";
  skill = "flowai-reflect";
  stepTimeoutMs = 300_000;
  agentsTemplateVars = {
    PROJECT_NAME: "BillingService",
    TOOLING_STACK: "- TypeScript",
  };

  userQuery =
    "Analyze the agent's performance in transcript.txt using flowai-reflect. Focus on context usage inefficiencies.";

  checklist = [
    {
      id: "read_transcript",
      description: "Did the agent read transcript.txt?",
      critical: true,
    },
    {
      id: "identify_redundant_reads",
      description:
        "Did the agent identify redundant file reads (auth.service.ts, email.ts are unrelated to billing bug)?",
      critical: true,
    },
    {
      id: "identify_repeated_read",
      description:
        "Did the agent identify the repeated read of invoice.ts (read twice without changes)?",
      critical: true,
    },
    {
      id: "identify_over_reading",
      description:
        "Did the agent identify over-reading (2000-line file read entirely for a single function fix)?",
      critical: false,
    },
    {
      id: "identify_missing_verification",
      description:
        "Did the agent identify missing verification (no tests run after the fix)?",
      critical: true,
    },
    {
      id: "identify_missing_docs",
      description:
        "Did the agent note that project docs (README, AGENTS.md) were never read to understand discount semantics?",
      critical: false,
    },
    {
      id: "actionable_table",
      description:
        "Did the agent present corrective actions in a structured format (table or categorized list)?",
      critical: false,
    },
  ];
}();
