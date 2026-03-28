import { BenchmarkSkillScenario } from "@bench/types.ts";
import { join } from "@std/path";

export const CommitSyncDocsBench = new class extends BenchmarkSkillScenario {
  id = "flowai-commit-sync-docs";
  name = "Workspace Sync: Docs Update";
  skill = "flowai-commit";
  stepTimeoutMs = 300_000;
  agentsTemplateVars = {
    PROJECT_NAME: "TestProject",
    TOOLING_STACK: "- TypeScript\n- Deno",
    generateDocuments: true,
  };

  override sandboxState = {
    commits: [],
    modified: ["src.ts"],
    expectedOutcome:
      "Agent updates documents/README.md and commits both code and docs",
  };

  override async setup(sandboxPath: string) {
    // Runner already committed everything as "init".
    // Change source code
    await Deno.writeTextFile(
      join(sandboxPath, "src.ts"),
      "console.log('new feature');",
    );
  }

  userQuery =
    "/flowai-commit I added a new feature in src.ts. Commit changes, but first update the documentation in documents/README.md to reflect the changes.";

  checklist = [
    {
      id: "docs_updated",
      description: "Did the agent update 'documents/README.md'?",
      critical: true,
    },
    {
      id: "docs_committed",
      description: "Is the documentation change included in a commit?",
      critical: true,
    },
  ];
}();
