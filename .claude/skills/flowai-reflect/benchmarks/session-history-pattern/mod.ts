import { BenchmarkSkillScenario } from "@bench/types.ts";

export const ReflectSessionHistoryBench = new class
  extends BenchmarkSkillScenario {
  id = "flowai-reflect-session-history";
  name = "Reflect on Session History Patterns";
  skill = "flowai-reflect";
  stepTimeoutMs = 300_000;
  agentsTemplateVars = {
    PROJECT_NAME: "OrdersApp",
    TOOLING_STACK: "- TypeScript\n- Deno",
  };

  userQuery =
    "Analyze the current session transcript (transcript.txt) AND the session history in session-history/ using flowai-reflect. Determine whether the errors in the current session are isolated incidents or recurring patterns across sessions.";

  checklist = [
    {
      id: "read_transcript",
      description: "Did the agent read transcript.txt (current session)?",
      critical: true,
    },
    {
      id: "read_session_history",
      description:
        "Did the agent read session history files from session-history/ directory?",
      critical: true,
    },
    {
      id: "identify_recurring_pattern",
      description:
        "Did the agent identify the recurring pattern across sessions (repeated test fix failures due to stale mocks, same TypeError pattern in 3 separate sessions)?",
      critical: true,
    },
    {
      id: "distinguish_from_isolated",
      description:
        "Did the agent explicitly distinguish recurring patterns from isolated/one-off issues (the current session's config.json issue is isolated, while the mock-related test failures are systemic)?",
      critical: true,
    },
    {
      id: "propose_systemic_fix",
      description:
        "Did the agent propose a systemic fix for the recurring pattern (e.g., rule for mock setup, shared test fixtures, or automated mock refresh)?",
      critical: true,
    },
    {
      id: "evidence_across_sessions",
      description:
        "Did the agent cite evidence from multiple sessions to support the pattern claim (not just the current session)?",
      critical: false,
    },
  ];
}();
