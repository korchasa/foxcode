import { join } from "@std/path";
import { BenchmarkSkillScenario } from "@bench/types.ts";

export const PlanVariantsComplexBench = new class
  extends BenchmarkSkillScenario {
  id = "flowai-plan-variants-complex";
  name = "Plan Variants - Complex Task";
  skill = "flowai-plan";
  stepTimeoutMs = 300_000;
  agentsTemplateVars = {
    PROJECT_NAME: "FinApp",
    TOOLING_STACK: "- TypeScript\n- Node.js\n- PostgreSQL",
    generateDocuments: true,
  };

  async setup(sandboxPath: string) {
    await Deno.mkdir(join(sandboxPath, "documents"), { recursive: true });
  }

  userQuery =
    "/flowai-plan Plan a user authentication system for a high-load financial application. Context: The app is a fintech startup 'FinApp'. Users are retail investors. Load: 10k RPS. Security is paramount (SOC2 compliance). We use Node.js/TypeScript. Database is PostgreSQL. No existing auth system. We need to choose between JWT, Session, or OAuth2 (Google/GitHub). Constraints: Must be implemented in-house or using standard libraries, no paid auth providers like Auth0.";

  checklist = [
    {
      id: "whiteboard_created",
      description:
        "Did the agent create/write to a file in 'documents/whiteboards/' directory (as required by the planning process)?",
      critical: true,
    },
    {
      id: "multiple_variants",
      description:
        "Did the agent present MULTIPLE (2 or more) implementation variants in the chat?",
      critical: true,
    },
    {
      id: "tradeoffs_discussed",
      description:
        "Did the agent discuss pros/cons/risks per variant and trade-offs across variants?",
      critical: true,
    },
  ];
}();
