import { BenchmarkSkillScenario } from "@bench/types.ts";
import { runGit } from "@bench/utils.ts";

export const CatchesIssuesBench = new class extends BenchmarkSkillScenario {
  id = "flowai-review-catches-issues";
  name = "Review catches code quality issues";
  skill = "flowai-review";
  maxSteps = 15;
  stepTimeoutMs = 420_000;
  agentsTemplateVars = {
    PROJECT_NAME: "AuthService",
    TOOLING_STACK: "- TypeScript\n- Deno",
  };
  interactive = true;

  override sandboxState = {
    commits: [{ message: "Remove auth.ts from tracking", files: ["auth.ts"] }],
    untracked: ["auth.ts"],
    expectedOutcome:
      "Agent reviews untracked auth.ts and requests changes due to issues",
  };

  override async setup(sandboxPath: string) {
    // Runner already committed all files (including auth.ts) as "init".
    // Remove auth.ts from index to make it untracked, keeping the working copy.
    await runGit(sandboxPath, ["rm", "--cached", "auth.ts"]);
    await runGit(sandboxPath, ["commit", "-m", "Remove auth.ts from tracking"]);

    // auth.ts has multiple issues:
    // - hardcoded secret
    // - console.log with credentials
    // - TODO marker
    // - `any` types
    // - no email validation (README promises it)
    // - no error handling for invalid credentials
  }

  userQuery = "/flowai-review The login function is implemented, please review";

  userPersona = `You are a developer who submitted code for review.
When the agent asks questions or proposes a review plan, confirm and let it proceed.
When shown review results, acknowledge them.
Keep answers brief and direct.`;

  checklist = [
    {
      id: "diff_collected",
      description:
        "Did the agent collect git diff or git status to identify the changes?",
      critical: true,
    },
    {
      id: "verdict_reject",
      description:
        "Did the review verdict indicate Request Changes (not Approve)?",
      critical: true,
    },
    {
      id: "found_secret",
      description:
        "Did the agent flag the hardcoded secret as a critical issue?",
      critical: true,
    },
    {
      id: "found_console_log",
      description: "Did the agent flag the console.log that leaks credentials?",
      critical: true,
    },
    {
      id: "found_missing_validation",
      description:
        "Did the agent flag missing email validation (promised in README)?",
      critical: false,
    },
    {
      id: "found_any_types",
      description: "Did the agent flag the use of `any` types?",
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
