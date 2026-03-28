import { BenchmarkSkillScenario } from "@bench/types.ts";

export const ReflectLoopBench = new class extends BenchmarkSkillScenario {
  id = "flowai-reflect-loop";
  name = "Reflect on Logic Loop";
  skill = "flowai-reflect";
  stepTimeoutMs = 300_000;
  agentsTemplateVars = {
    PROJECT_NAME: "ReflectTarget",
    TOOLING_STACK: "- TypeScript",
  };

  userQuery =
    "Analyze the agent's performance in transcript.txt using flowai-reflect. Identify the main logical error.";

  checklist = [
    {
      id: "read_transcript",
      description: "Did the agent read transcript.txt?",
      critical: true,
    },
    {
      id: "identify_loop",
      description:
        "Did the agent identify the repetitive actions (loop) or failure to check file existence?",
      critical: true,
    },
    {
      id: "propose_fix",
      description:
        "Did the agent propose a process fix (e.g., check file existence first)?",
      critical: true,
    },
  ];
}();
