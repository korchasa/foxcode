import { BenchmarkSkillScenario } from "@bench/types.ts";
import { join } from "@std/path";

export const CommitAtomicDocsBench = new class extends BenchmarkSkillScenario {
  id = "flowai-commit-atomic-docs";
  name = "Atomic Split: Docs vs Code";
  skill = "flowai-commit";
  stepTimeoutMs = 300_000;
  agentsTemplateVars = {
    PROJECT_NAME: "TestProject",
    TOOLING_STACK: "- TypeScript\n- Deno",
  };

  override sandboxState = {
    commits: [],
    modified: ["README.md", "main.ts"],
    expectedOutcome:
      "Agent splits changes into at least 2 commits: docs and code",
  };

  override async setup(sandboxPath: string) {
    // Runner already committed everything as "init".
    // Change 1: Docs
    await Deno.writeTextFile(join(sandboxPath, "README.md"), "# New Title");
    // Change 2: Code
    await Deno.writeTextFile(
      join(sandboxPath, "main.ts"),
      "console.log('hello');",
    );
  }

  userQuery =
    "/flowai-commit Commit changes. I updated README.md (docs) and main.ts (code). Split documentation and code.";

  checklist = [
    {
      id: "multiple_commits",
      description: "Did the agent create at least 2 new commits?",
      critical: true,
    },
    {
      id: "docs_commit",
      description: "Is there a commit with type 'docs'?",
      critical: true,
    },
    {
      id: "feat_fix_commit",
      description: "Is there a commit with type 'feat', 'fix', or 'refactor'?",
      critical: true,
    },
    {
      id: "clean_status",
      description: "Is the final git status clean?",
      critical: true,
    },
  ];
}();
