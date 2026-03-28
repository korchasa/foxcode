import { BenchmarkSkillScenario } from "@bench/types.ts";
import { join } from "@std/path";

export const CommitConsolidateBench = new class extends BenchmarkSkillScenario {
  id = "flowai-commit-consolidate";
  name = "Consolidation: Multi-file single feature";
  skill = "flowai-commit";
  stepTimeoutMs = 300_000;
  agentsTemplateVars = {
    PROJECT_NAME: "TestProject",
    TOOLING_STACK: "- TypeScript\n- Deno",
  };

  override sandboxState = {
    commits: [],
    modified: ["math.ts", "math.test.ts", "README.md"],
    expectedOutcome:
      "Agent creates exactly 1 commit containing all three changed files",
  };

  override async setup(sandboxPath: string) {
    // Runner already committed everything as "init".
    // All changes belong to the same feature: add multiply function
    // File 1: Implementation
    await Deno.writeTextFile(
      join(sandboxPath, "math.ts"),
      [
        "export function add(a: number, b: number): number {",
        "  return a + b;",
        "}",
        "",
        "export function multiply(a: number, b: number): number {",
        "  return a * b;",
        "}",
        "",
      ].join("\n"),
    );

    // File 2: Tests for the new function
    await Deno.writeTextFile(
      join(sandboxPath, "math.test.ts"),
      [
        'import { assertEquals } from "jsr:@std/assert";',
        'import { add, multiply } from "./math.ts";',
        "",
        'Deno.test("add returns sum of two numbers", () => {',
        "  assertEquals(add(1, 2), 3);",
        "});",
        "",
        'Deno.test("multiply returns product of two numbers", () => {',
        "  assertEquals(multiply(2, 3), 6);",
        "});",
        "",
      ].join("\n"),
    );

    // File 3: Documentation update
    await Deno.writeTextFile(
      join(sandboxPath, "README.md"),
      [
        "# Test Project",
        "",
        "## Functions",
        "",
        "- `add(a, b)` - Returns sum of two numbers",
        "- `multiply(a, b)` - Returns product of two numbers",
        "",
      ].join("\n"),
    );
  }

  userQuery =
    "/flowai-commit I added a multiply function with tests and updated the README. Commit the changes.";

  checklist = [
    {
      id: "single_commit",
      description:
        "Did the agent create exactly 1 new commit (not 2 or more)? All changes (math.ts, math.test.ts, README.md) serve the same purpose — adding the multiply feature — and MUST be in a single commit.",
      critical: true,
    },
    {
      id: "all_files_in_commit",
      description:
        "Does the single commit contain ALL three changed files (math.ts, math.test.ts, README.md)?",
      critical: true,
    },
    {
      id: "conventional_commits",
      description:
        "Does the commit message follow Conventional Commits format?",
      critical: true,
    },
    {
      id: "clean_status",
      description: "Is the final git status clean?",
      critical: true,
    },
  ];
}();
