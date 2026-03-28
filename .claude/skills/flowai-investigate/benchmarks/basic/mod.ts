import { BenchmarkSkillScenario } from "@bench/types.ts";

export const InvestigateBasicBench = new class extends BenchmarkSkillScenario {
  id = "flowai-investigate-basic";
  name = "Basic Issue Investigation";
  skill = "flowai-investigate";
  stepTimeoutMs = 300_000;
  agentsTemplateVars = {
    PROJECT_NAME: "MathApp",
    TOOLING_STACK: "- TypeScript",
  };

  userQuery =
    "/flowai-investigate The calculateTotal function in src/math.ts returns incorrect results. For price 10 and quantity 2, it returns 30 instead of 20. Investigate this. I want to see multiple hypotheses first. Use only standard CLI tools like cat, ls, grep.";

  checklist = [
    {
      id: "hypotheses_proposed",
      description: "Did the agent propose 3-7 hypotheses?",
      critical: true,
    },
    {
      id: "user_control",
      description:
        "Did the agent STOP after proposing hypotheses and ask the user to select one?",
      critical: true,
    },
  ];
}();
