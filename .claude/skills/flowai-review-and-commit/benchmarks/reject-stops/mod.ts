import { BenchmarkSkillScenario } from "@bench/types.ts";
import { runGit } from "@bench/utils.ts";

export const RejectStopsBench = new class extends BenchmarkSkillScenario {
  id = "flowai-review-and-commit-reject";
  name = "Review Rejects and Stops Without Commit";
  skill = "flowai-review-and-commit";
  maxSteps = 5;
  stepTimeoutMs = 420_000;
  agentsTemplateVars = {
    PROJECT_NAME: "TestProject",
    TOOLING_STACK: "- TypeScript\n- Deno",
  };
  interactive = true;

  override sandboxState = {
    commits: [{ message: "Remove calc.ts from tracking", files: ["calc.ts"] }],
    untracked: ["calc.ts"],
    expectedOutcome:
      "Agent reviews untracked calc.ts, rejects due to missing error handling, does not commit",
  };

  override async setup(sandboxPath: string) {
    // Runner already committed all files (including calc.ts) as "init".
    // Remove calc.ts from index to make it untracked, keeping the working copy.
    await runGit(sandboxPath, ["rm", "--cached", "calc.ts"]);
    await runGit(sandboxPath, ["commit", "-m", "Remove calc.ts from tracking"]);

    // calc.ts implements divide(a, b) as a / b — no zero check, no error handling.
    // README promises error handling but code lacks it → phantom completion → Request Changes.
  }

  userQuery =
    "/flowai-review-and-commit The divide function is implemented, review and commit";

  userPersona =
    `You are a developer who submitted the divide function for review and commit.
When the agent asks questions or proposes a review plan, confirm and let it proceed.
When shown review results with "Request Changes" verdict, say "OK, I'll fix these issues myself later. Thanks for the review." and STOP.
NEVER ask the agent to fix anything. NEVER ask for another review. Just acknowledge the report.`;

  checklist = [
    {
      id: "review_executed",
      description: "Did the agent perform a review of the changes?",
      critical: true,
    },
    {
      id: "review_rejected",
      description:
        "Did the review verdict indicate Request Changes (not Approve) due to missing error handling?",
      critical: true,
    },
    {
      id: "no_commit",
      description:
        "No new commits were created after the initial commit (agent stopped before committing)?",
      critical: true,
    },
    {
      id: "report_shown",
      description:
        "Did the agent output review findings to the user explaining the issues?",
      critical: true,
    },
  ];
}();
