import { BenchmarkSkillScenario } from "@bench/types.ts";
import { runGit } from "@bench/utils.ts";

export const CommitBasicBench = new class extends BenchmarkSkillScenario {
  id = "flowai-commit-basic";
  name = "Basic Feature Commit";
  skill = "flowai-commit";
  stepTimeoutMs = 300_000;
  agentsTemplateVars = {
    PROJECT_NAME: "TestProject",
    TOOLING_STACK: "- TypeScript\n- Deno",
  };

  override sandboxState = {
    commits: [],
    untracked: ["utils.ts"],
    expectedOutcome:
      "Agent commits utils.ts with a conventional commit message",
  };

  override async setup(sandboxPath: string) {
    // Runner already committed everything (including utils.ts) as "init".
    // Remove utils.ts from index but keep the working copy — makes it untracked.
    await runGit(sandboxPath, ["rm", "--cached", "utils.ts"]);
    await runGit(sandboxPath, [
      "commit",
      "-m",
      "Remove utils.ts from tracking",
    ]);
  }

  userQuery =
    "/flowai-commit I added a sum function in utils.ts. Commit this changes.";

  checklist = [
    {
      id: "file_committed",
      description: "Is `utils.ts` present in the last commit?",
      critical: true,
    },
    {
      id: "commit_message_match",
      description: "Does the commit message describe sum function?",
      critical: false,
    },
    {
      id: "conventional_commits",
      description: "Does the commit message follow Conventional Commits?",
      critical: false,
    },
    {
      id: "clean_status",
      description: "Is the final git status clean?",
      critical: true,
    },
  ];
}();
