import { join } from "@std/path";
import { BenchmarkSkillScenario } from "@bench/types.ts";

export const ReviewAndCommitAutoDocsBench = new class
  extends BenchmarkSkillScenario {
  id = "flowai-review-and-commit-auto-docs";
  name = "Autonomous Documentation Update after Review";
  skill = "flowai-review-and-commit";
  maxSteps = 20;
  stepTimeoutMs = 420_000;
  agentsTemplateVars = {
    PROJECT_NAME: "TestProject",
    TOOLING_STACK: "- TypeScript\n- Deno",
    generateDocuments: true,
  };
  interactive = true;

  override sandboxState = {
    commits: [],
    modified: ["math.ts"],
    expectedOutcome:
      "Agent reviews modified math.ts, updates docs to reflect subtract, and commits all",
  };

  override async setup(sandboxPath: string) {
    // Runner already committed all files (including math.ts with only `add`) as "init".
    // Now add `subtract` function — documents are outdated
    const updatedMath =
      "export const add = (a: number, b: number) => a + b;\nexport const subtract = (a: number, b: number) => a - b;\n";
    await Deno.writeTextFile(join(sandboxPath, "math.ts"), updatedMath);
  }

  // NOTE: userQuery does NOT ask to update docs — the agent must do it autonomously
  userQuery =
    "/flowai-review-and-commit I added a subtract function in math.ts. Review and commit.";

  userPersona =
    `You are a developer who submitted clean code for review and commit.
When the agent asks questions or proposes a review plan, confirm and let it proceed.
When shown review results, approve them. When asked to confirm commit, approve.
Keep answers brief and affirmative.`;

  checklist = [
    {
      id: "review_executed",
      description: "Did the agent perform a review of the changes?",
      critical: true,
    },
    {
      id: "review_approved",
      description:
        "Did the review verdict indicate Approve (no critical issues)?",
      critical: true,
    },
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
