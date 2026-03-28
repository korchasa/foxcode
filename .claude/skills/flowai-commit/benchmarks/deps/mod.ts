import { BenchmarkSkillScenario } from "@bench/types.ts";
import { join } from "@std/path";

export const CommitDepsBench = new class extends BenchmarkSkillScenario {
  id = "flowai-commit-deps";
  name = "Atomic Split: Deps vs Logic";
  skill = "flowai-commit";
  stepTimeoutMs = 300_000;
  agentsTemplateVars = {
    PROJECT_NAME: "TestProject",
    TOOLING_STACK: "- TypeScript\n- Deno",
  };

  override sandboxState = {
    commits: [],
    modified: ["deno.json", "mod.ts"],
    expectedOutcome:
      "Agent splits changes into at least 2 commits: build/chore and feat/fix",
  };

  override async setup(sandboxPath: string) {
    // Runner already committed everything as "init".
    // Change 1: Bump version
    await Deno.writeTextFile(
      join(sandboxPath, "deno.json"),
      `{ "version": "1.1.0" }`,
    );
    // Change 2: Logic
    await Deno.writeTextFile(
      join(sandboxPath, "mod.ts"),
      "export const v = 2;",
    );
  }

  userQuery =
    "/flowai-commit Commit changes. I updated the version in deno.json and the logic in mod.ts. Split them.";

  checklist = [
    {
      id: "multiple_commits",
      description: "Did the agent create at least 2 new commits?",
      critical: true,
    },
    {
      id: "build_commit",
      description:
        "Is there a commit with type 'build' or 'chore' for json change?",
      critical: false,
    },
    {
      id: "feat_fix_commit",
      description: "Is there a commit with type 'feat' or 'fix' for logic?",
      critical: true,
    },
  ];
}();
