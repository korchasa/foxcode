import { BenchmarkSkillScenario } from "@bench/types.ts";
import { join } from "@std/path";

export const CommitAtomicHunkBench = new class extends BenchmarkSkillScenario {
  id = "flowai-commit-atomic-hunk";
  name = "Atomic Split: Hunk (Style vs Logic)";
  skill = "flowai-commit";
  stepTimeoutMs = 300_000;
  agentsTemplateVars = {
    PROJECT_NAME: "TestProject",
    TOOLING_STACK: "- TypeScript\n- Deno",
  };

  override sandboxState = {
    commits: [],
    modified: ["code.ts"],
    expectedOutcome:
      "Agent splits changes into at least 2 commits: style and refactor",
  };

  override async setup(sandboxPath: string) {
    // Runner already committed everything as "init".
    // Change 1: Logic (rename function)
    // Change 2: Style (add spaces)
    await Deno.writeTextFile(
      join(sandboxPath, "code.ts"),
      "function newName() { return 1; } \n// Added comment for style",
    );
  }

  userQuery =
    "/flowai-commit Commit changes. I renamed a function (logic) and added a comment (style). Split them into two commits (style and refactor).";

  checklist = [
    {
      id: "multiple_commits",
      description: "Did the agent create at least 2 new commits?",
      critical: true,
    },
    {
      id: "style_commit",
      description: "Is there a commit with type 'style'?",
      critical: true,
    },
    {
      id: "refactor_commit",
      description: "Is there a commit with type 'refactor'?",
      critical: true,
    },
  ];
}();
