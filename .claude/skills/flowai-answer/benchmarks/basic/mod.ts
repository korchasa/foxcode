import { BenchmarkSkillScenario } from "@bench/types.ts";

export const AnswerBasicBench = new class extends BenchmarkSkillScenario {
  id = "flowai-answer-basic";
  name = "Basic Codebase Q&A";
  skill = "flowai-answer";
  agentsTemplateVars = {
    PROJECT_NAME: "AuthService",
    TOOLING_STACK: "- TypeScript",
  };

  userQuery =
    "/flowai-answer How is password hashing implemented in this project? Does it follow the requirements?";

  checklist = [
    {
      id: "docs_read",
      description:
        "Did the agent read documents/requirements.md and documents/design.md?",
      critical: true,
    },
    {
      id: "code_read",
      description: "Did the agent read src/auth.service.ts?",
      critical: true,
    },
    {
      id: "correct_answer",
      description:
        "Did the agent correctly identify that bcrypt is used for hashing as required?",
      critical: true,
    },
  ];
}();
