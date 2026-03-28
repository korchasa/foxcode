import { BenchmarkSkillScenario } from "@bench/types.ts";
import { runGit } from "@bench/utils.ts";

export const CleanApproveBench = new class extends BenchmarkSkillScenario {
  id = "flowai-review-clean-approve";
  name = "Review approves clean changes";
  skill = "flowai-review";
  maxSteps = 15;
  stepTimeoutMs = 420_000;
  agentsTemplateVars = {
    PROJECT_NAME: "StringUtils",
    TOOLING_STACK: "- TypeScript\n- Deno",
  };
  interactive = true;

  override sandboxState = {
    commits: [{
      message: "Remove strings.ts from tracking",
      files: ["strings.ts"],
    }],
    untracked: ["strings.ts"],
    expectedOutcome:
      "Agent reviews untracked strings.ts and approves clean code",
  };

  override async setup(sandboxPath: string) {
    // Runner already committed all files (including strings.ts) as "init".
    // Remove strings.ts from index to make it untracked, keeping the working copy.
    await runGit(sandboxPath, ["rm", "--cached", "strings.ts"]);
    await runGit(sandboxPath, [
      "commit",
      "-m",
      "Remove strings.ts from tracking",
    ]);

    // strings.ts is now untracked — the agent should review it
  }

  userQuery = "/flowai-review Review the added capitalize function";

  userPersona = `You are a developer who submitted clean code for review.
When the agent asks questions or proposes a review plan, confirm and let it proceed.
When shown review results, acknowledge them.
Keep answers brief and affirmative.`;

  checklist = [
    {
      id: "diff_collected",
      description:
        "Did the agent collect git diff or git status to identify the changes?",
      critical: true,
    },
    {
      id: "review_executed",
      description:
        "Did the agent perform both QA and code review checks on the diff?",
      critical: true,
    },
    {
      id: "verdict_approve",
      description:
        "Did the review verdict indicate Approve (no critical issues)?",
      critical: true,
    },
    {
      id: "structured_report",
      description:
        "Did the agent output a structured report with findings sections and summary?",
      critical: false,
    },
    {
      id: "no_commit",
      description:
        "The agent did NOT commit any changes (review only, not commit)?",
      critical: true,
    },
  ];
}();
