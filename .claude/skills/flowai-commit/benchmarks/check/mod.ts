import { join } from "@std/path";
import { BenchmarkSkillScenario } from "@bench/types.ts";

export const CommitCheckBench = new class extends BenchmarkSkillScenario {
  id = "flowai-commit-check";
  name = "Pre-flight Check";
  skill = "flowai-commit";
  stepTimeoutMs = 300_000;
  agentsTemplateVars = {
    PROJECT_NAME: "TestProject",
    TOOLING_STACK: "- TypeScript\n- Deno",
  };

  override sandboxState = {
    commits: [],
    modified: ["file.ts"],
    expectedOutcome:
      "Agent runs 'deno task check' before committing and commits the change",
  };

  override async setup(sandboxPath: string) {
    // Runner already committed everything as "init".
    // Modify file.ts to create a tracked-but-changed state.
    await Deno.writeTextFile(join(sandboxPath, "file.ts"), "const x = 2;");
  }

  userQuery = "/flowai-commit Commit changes in file.ts.";

  checklist = [
    {
      id: "check_executed",
      description: "Did the agent run 'deno task check'?",
      critical: false,
    },
    {
      id: "clean_status",
      description: "Is the final git status clean?",
      critical: true,
    },
  ];
}();
