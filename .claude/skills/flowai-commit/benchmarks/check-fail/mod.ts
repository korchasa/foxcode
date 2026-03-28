import { join } from "@std/path";
import { BenchmarkSkillScenario } from "@bench/types.ts";

export const CommitCheckFailBench = new class extends BenchmarkSkillScenario {
  id = "flowai-commit-check-fail";
  name = "Pre-flight Check Failure";
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
      "Agent runs 'deno task check', it fails, and agent aborts the commit",
  };

  override async setup(sandboxPath: string) {
    // Runner already committed everything as "init".
    // Modify file.ts to create a tracked-but-changed state.
    await Deno.writeTextFile(join(sandboxPath, "file.ts"), "const x = 2;");
  }

  userQuery = "/flowai-commit Commit changes.";

  checklist = [
    {
      id: "check_executed",
      description: "Did the agent run 'deno task check'?",
      critical: true,
    },
    {
      id: "no_commit_on_fail",
      description: "Did the agent ABORT the commit process (no new commits)?",
      critical: true,
    },
  ];
}();
