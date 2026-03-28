import { BenchmarkSkillScenario } from "@bench/types.ts";
import { runGit } from "@bench/utils.ts";

export const ApproveAndCommitBench = new class extends BenchmarkSkillScenario {
  id = "flowai-review-and-commit-approve";
  name = "Review Approve then Commit";
  skill = "flowai-review-and-commit";
  maxSteps = 20;
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
      "Agent reviews untracked utils.ts, approves, and commits it",
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

    // utils.ts is now untracked — for the agent to review and commit
  }

  userQuery =
    "/flowai-review-and-commit Review and commit the added sum function";

  userPersona =
    `You are a developer who submitted clean code for review and commit.
When the agent asks questions or proposes a review plan, confirm and let it proceed.
When shown review results, approve them. When asked to confirm commit, approve.
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
      id: "conventional_commits",
      description:
        "Does the commit message follow Conventional Commits format?",
      critical: false,
    },
    {
      id: "clean_status",
      description:
        "Is the final git status clean (no untracked or modified files)?",
      critical: true,
    },
    {
      id: "no_reflect_suggestion",
      description:
        "Did the agent correctly skip the /flowai-reflect suggestion? In a simple session without errors, retries, or user corrections, the agent must NOT suggest running /flowai-reflect.",
      critical: false,
    },
  ];
}();
