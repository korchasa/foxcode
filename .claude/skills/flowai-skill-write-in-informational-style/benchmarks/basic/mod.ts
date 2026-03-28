import { BenchmarkSkillScenario } from "@bench/types.ts";

export const WriteInInformationalStyleBasicBench = new class
  extends BenchmarkSkillScenario {
  id = "flowai-skill-write-in-informational-style-basic";
  name = "Rewrite Bureaucratic Text in Informational Style";
  skill = "flowai-skill-write-in-informational-style";
  agentsTemplateVars = {
    PROJECT_NAME: "ContentEditor",
  };

  userQuery =
    '/flowai-skill-write-in-informational-style Rewrite the following text: "In accordance with the provisions set forth by the municipal authorities, we hereby inform all residents of the designated zones that, due to the commencement of comprehensive infrastructure modernization works pertaining to the water supply system, the supply of potable water will be temporarily suspended for the period beginning on the first day of June and concluding on the fifteenth day of June of the current calendar year. We kindly request that all affected parties take the necessary precautionary measures to ensure adequate water reserves are maintained throughout the aforementioned period."';

  checklist = [
    {
      id: "shorter_than_original",
      description:
        "Is the rewritten text significantly shorter than the original (at least 50% fewer words)?",
      critical: true,
    },
    {
      id: "preserves_key_facts",
      description:
        "Does the rewritten text preserve the key facts: water supply off, June 1-15, stock up on water?",
      critical: true,
    },
    {
      id: "no_bureaucratic_language",
      description:
        "Is the text free of bureaucratic phrases like 'hereby inform', 'in accordance with', 'aforementioned', 'pertaining to'?",
      critical: true,
    },
    {
      id: "uses_simple_words",
      description:
        "Does the text use simple, common words instead of complex ones (e.g., 'water' not 'potable water', 'start' not 'commencement')?",
      critical: true,
    },
    {
      id: "active_voice",
      description: "Does the text prefer active voice over passive voice?",
      critical: false,
    },
    {
      id: "markdown_format",
      description:
        "Is the output presented in markdown format (inside four backticks as specified by the skill)?",
      critical: false,
    },
  ];
}();
