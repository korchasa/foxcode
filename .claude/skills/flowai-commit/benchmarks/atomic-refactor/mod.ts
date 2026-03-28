import { BenchmarkSkillScenario } from "@bench/types.ts";
import { join } from "@std/path";

export const CommitAtomicRefactorBench = new class
  extends BenchmarkSkillScenario {
  id = "flowai-commit-atomic-refactor";
  name = "Atomic Split: Refactor vs Feature";
  skill = "flowai-commit";
  stepTimeoutMs = 300_000;
  agentsTemplateVars = {
    PROJECT_NAME: "TestProject",
    TOOLING_STACK: "- TypeScript\n- Deno",
  };

  override sandboxState = {
    commits: [],
    modified: ["math.ts"],
    untracked: ["utils.ts"],
    expectedOutcome:
      "Agent splits changes into at least 2 commits: refactor and feat",
  };

  override async setup(sandboxPath: string) {
    // Runner already committed everything as "init".
    // File 1: Refactor
    await Deno.writeTextFile(
      join(sandboxPath, "math.ts"),
      "export const add = (a, b) => a + b; // Renamed from sum",
    );

    // File 2: New Feature
    await Deno.writeTextFile(
      join(sandboxPath, "utils.ts"),
      "export const log = (msg) => console.log(msg);",
    );
  }

  userQuery =
    "/flowai-commit Commit changes. I renamed a function in math.ts (refactoring) and added utils.ts (new feature). Separate refactoring from the new feature.";

  checklist = [
    {
      id: "multiple_commits",
      description: "Did the agent create at least 2 new commits?",
      critical: true,
    },
    {
      id: "refactor_commit",
      description: "Is there a commit with type 'refactor'?",
      critical: true,
    },
    {
      id: "feat_commit",
      description: "Is there a commit with type 'feat'?",
      critical: true,
    },
  ];
}();
