import { BenchmarkSkillScenario } from "@bench/types.ts";

export const FixTestsBasicBench = new class extends BenchmarkSkillScenario {
  id = "flowai-skill-fix-tests-basic";
  name = "Fix a failing divide-by-zero test";
  skill = "flowai-skill-fix-tests";
  agentsTemplateVars = {
    PROJECT_NAME: "Calculator",
    TOOLING_STACK: "- TypeScript\n- Deno",
  };

  userQuery =
    "/flowai-skill-fix-tests The test 'divide by zero throws an error' is failing. The test expects divide(10, 0) to throw an Error with message 'Cannot divide by zero', but the function returns Infinity instead. Fix the code.";

  override setup(sandboxDir: string): Promise<void> {
    // Create a deno.json so @std/assert resolves in the sandbox
    Deno.writeTextFileSync(
      `${sandboxDir}/deno.json`,
      JSON.stringify(
        {
          imports: {
            "@std/assert": "jsr:@std/assert@^1.0.19",
          },
        },
        null,
        2,
      ),
    );
    return Promise.resolve();
  }

  checklist = [
    {
      id: "identified_root_cause",
      description:
        "Did the agent identify that the divide function lacks a zero-divisor check as the root cause?",
      critical: true,
    },
    {
      id: "ran_failing_test",
      description:
        "Did the agent run the failing test in isolation to reproduce the error before making changes?",
      critical: true,
    },
    {
      id: "fixed_production_code",
      description:
        "Did the agent add a division-by-zero guard to the divide function that throws an Error with the message 'Cannot divide by zero'?",
      critical: true,
    },
    {
      id: "did_not_modify_test",
      description:
        "Did the agent leave the test file unchanged (fix the code, not the test)?",
      critical: true,
    },
    {
      id: "all_tests_pass",
      description:
        "Did the agent run the full test suite after the fix and confirm all tests pass?",
      critical: true,
    },
    {
      id: "minimal_change",
      description:
        "Was the fix minimal — only adding the zero-check guard, without refactoring unrelated code?",
      critical: false,
    },
  ];
}();
