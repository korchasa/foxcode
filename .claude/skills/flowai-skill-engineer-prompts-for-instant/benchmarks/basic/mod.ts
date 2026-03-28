import { BenchmarkSkillScenario } from "@bench/types.ts";

export const EngineerPromptsForInstantBench = new class
  extends BenchmarkSkillScenario {
  id = "flowai-skill-engineer-prompts-for-instant-basic";
  name = "Write a prompt for an instant model to extract structured data";
  skill = "flowai-skill-engineer-prompts-for-instant";
  agentsTemplateVars = {
    PROJECT_NAME: "EmailExtractor",
  };

  userQuery =
    "/flowai-skill-engineer-prompts-for-instant Help me write a prompt for GPT-4o Mini that extracts product names and prices from unstructured customer emails and outputs them as JSON.";

  checklist = [
    {
      id: "uses_4part_formula",
      description:
        "Does the generated prompt follow the 4-part formula structure (Role, Task, Rules/Format, Examples)?",
      critical: true,
    },
    {
      id: "includes_few_shot_examples",
      description:
        "Does the prompt include at least one few-shot example showing input and expected output?",
      critical: true,
    },
    {
      id: "specifies_output_format",
      description:
        "Does the prompt explicitly specify JSON as the output format with a concrete structure?",
      critical: true,
    },
    {
      id: "includes_negative_constraints",
      description:
        "Does the prompt include negative constraints (e.g., no extra text, no explanations)?",
      critical: false,
    },
    {
      id: "handles_edge_cases",
      description:
        "Does the prompt address edge cases like missing prices or ambiguous product names (e.g., return 'N/A' or 'Unknown')?",
      critical: false,
    },
  ];
}();
