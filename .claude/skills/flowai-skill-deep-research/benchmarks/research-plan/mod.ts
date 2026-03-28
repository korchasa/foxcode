import { BenchmarkSkillScenario } from "@bench/types.ts";

export const DeepResearchPlanBench = new class extends BenchmarkSkillScenario {
  id = "flowai-skill-deep-research-plan";
  name = "Create a deep research plan with directions and queries";
  skill = "flowai-skill-deep-research";
  agentsTemplateVars = {
    PROJECT_NAME: "WasmResearch",
  };
  stepTimeoutMs = 600_000;

  userQuery =
    "/flowai-skill-deep-research Research the current state of WebAssembly adoption in server-side applications. Focus on performance benchmarks, production use cases, and limitations compared to native code.";

  maxSteps = 5;

  checklist = [
    {
      id: "search_method_detection",
      description:
        "Did the agent attempt to detect the available search method (built-in, playwright-cli, MCP) before planning?",
      critical: true,
    },
    {
      id: "directions_count",
      description:
        "Did the agent decompose the topic into 3-6 non-overlapping research directions?",
      critical: true,
    },
    {
      id: "queries_per_direction",
      description:
        "Did each direction include 3-5 search query variations (broad, narrow, criticism)?",
      critical: true,
    },
    {
      id: "acceptance_criteria",
      description:
        "Did each direction specify acceptance criteria (source type, recency)?",
      critical: false,
    },
    {
      id: "output_files_defined",
      description:
        "Did the plan define output file paths in a temporary directory (system temp via mktemp or similar) for each direction?",
      critical: true,
    },
    {
      id: "no_approval_wait",
      description:
        "Did the agent proceed automatically without asking for user approval of the plan?",
      critical: false,
    },
  ];
}();
