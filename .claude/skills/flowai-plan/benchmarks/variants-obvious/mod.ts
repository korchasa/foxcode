import { join } from "@std/path";
import { BenchmarkSkillScenario } from "@bench/types.ts";

export const PlanVariantsObviousBench = new class
  extends BenchmarkSkillScenario {
  id = "flowai-plan-variants-obvious";
  name = "Plan Variants - Obvious Task";
  skill = "flowai-plan";
  stepTimeoutMs = 300_000;
  agentsTemplateVars = {
    PROJECT_NAME: "TestProject",
    TOOLING_STACK: "- TypeScript\n- Deno",
    generateDocuments: true,
  };

  async setup(sandboxPath: string) {
    await Deno.mkdir(join(sandboxPath, "documents"), { recursive: true });
  }

  userQuery =
    "/flowai-plan Plan the creation of a 'hello.txt' file containing 'Hello World'. Context: This is a test project. No other requirements. Just plan it.";

  checklist = [
    {
      id: "whiteboard_created",
      description:
        "Did the agent create/write to a file in 'documents/whiteboards/' directory (as required by the planning process)?",
      critical: true,
    },
    {
      id: "single_variant",
      description:
        "Did the agent present EXACTLY ONE implementation variant in the chat? It should NOT offer alternatives for such a simple task.",
      critical: true,
    },
  ];
}();
