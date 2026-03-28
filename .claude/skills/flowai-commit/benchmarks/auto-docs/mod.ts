import { join } from "@std/path";
import { BenchmarkSkillScenario } from "@bench/types.ts";

export const CommitAutoDocsBench = new class extends BenchmarkSkillScenario {
  id = "flowai-commit-auto-docs";
  name = "Autonomous Documentation Update";
  skill = "flowai-commit";
  stepTimeoutMs = 300_000;
  agentsTemplateVars = {
    PROJECT_NAME: "TestProject",
    TOOLING_STACK: "- TypeScript\n- Deno",
    generateDocuments: true,
  };

  override sandboxState = {
    commits: [],
    modified: ["math.ts"],
    expectedOutcome:
      "Agent autonomously updates documents/ to reflect the new subtract function and commits everything",
  };

  override async setup(sandboxPath: string) {
    // Runner already committed everything (including math.ts with `add` only) as "init".
    // Add `subtract` function — documents are now outdated.
    const updatedMath =
      "export const add = (a: number, b: number) => a + b;\nexport const subtract = (a: number, b: number) => a - b;\n";
    await Deno.writeTextFile(join(sandboxPath, "math.ts"), updatedMath);
  }

  // NOTE: userQuery does NOT ask to update docs — the agent must do it autonomously
  userQuery =
    "/flowai-commit I added a subtract function in math.ts. Commit the changes.";

  checklist = [
    {
      id: "docs_updated",
      description:
        "Did the agent update at least one file in `documents/` (requirements.md or design.md) to reflect the new subtract function? Check file contents for mentions of 'subtract'.",
      critical: true,
    },
    {
      id: "docs_committed",
      description:
        "Is the documentation change included in a commit (not left as unstaged/untracked)?",
      critical: true,
    },
    {
      id: "code_committed",
      description: "Is the updated `math.ts` present in a commit?",
      critical: true,
    },
    {
      id: "doc_audit_report",
      description:
        "Did the agent output a documentation audit report listing which documents were checked and what was updated/skipped?",
      critical: false,
    },
  ];
}();
