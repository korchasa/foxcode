import { BenchmarkSkillScenario } from "@bench/types.ts";
import { runGit } from "@bench/utils.ts";

export const SuggestReflectBench = new class extends BenchmarkSkillScenario {
  id = "flowai-review-and-commit-suggest-reflect";
  name = "Suggest Reflect After Complex Session";
  skill = "flowai-review-and-commit";
  maxSteps = 25;
  stepTimeoutMs = 420_000;
  agentsTemplateVars = {
    PROJECT_NAME: "TestProject",
    TOOLING_STACK: "- TypeScript\n- Deno",
  };
  interactive = true;

  override sandboxState = {
    commits: [{
      message: "Remove utils.ts from tracking",
      files: ["utils.ts"],
    }],
    untracked: ["utils.ts"],
    expectedOutcome:
      "Agent reviews untracked utils.ts, approves, commits, and suggests /flowai-reflect due to complex session",
  };

  override async setup(sandboxPath: string) {
    // Runner already committed all files (including utils.ts) as "init".
    // Remove utils.ts from index to make it untracked, keeping the working copy.
    await runGit(sandboxPath, ["rm", "--cached", "utils.ts"]);
    await runGit(sandboxPath, [
      "commit",
      "-m",
      "Remove utils.ts from tracking",
    ]);

    // utils.ts is now untracked — agent will review and commit it
  }

  userQuery =
    "This session was rough — I hit several errors, had to retry tests multiple times, and you suggested a wrong approach that I had to correct. Now the code is ready. /flowai-review-and-commit Review and commit the new utility functions.";

  userPersona =
    `You are a developer who had a difficult session with many errors and retries before reaching this point.
When the agent asks questions or proposes a review plan, confirm and let it proceed.
When shown review results, approve them. When asked to confirm commit, approve.
If the agent asks about the session difficulties, confirm that there were errors, retries, and corrections.
Keep answers brief and affirmative.`;

  checklist = [
    {
      id: "review_executed",
      description: "Did the agent perform a review of the changes?",
      critical: true,
    },
    {
      id: "review_approved",
      description:
        "Did the review verdict indicate Approve (no critical issues)?",
      critical: true,
    },
    {
      id: "file_committed",
      description: "Is `utils.ts` present in the last commit?",
      critical: true,
    },
    {
      id: "suggest_reflect",
      description:
        "Did the agent suggest running `/flowai-reflect` (or mention flowai-reflect) after committing, citing session complexity signals like errors, retries, or user corrections?",
      critical: true,
    },
  ];
}();
