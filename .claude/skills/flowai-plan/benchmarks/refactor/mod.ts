import { BenchmarkSkillScenario } from "@bench/types.ts";

export const PlanRefactorBench = new class extends BenchmarkSkillScenario {
  id = "flowai-plan-refactor";
  name = "Plan Refactoring of God Class";
  skill = "flowai-plan";
  stepTimeoutMs = 300_000;
  agentsTemplateVars = {
    PROJECT_NAME: "TestProject",
    TOOLING_STACK: "- TypeScript",
    generateDocuments: true,
  };

  userQuery =
    "/flowai-plan Plan a refactoring of src/UserManager.ts to separate concerns. It does too much right now.";

  checklist = [
    {
      id: "identify_responsibilities",
      description:
        "Does the plan identify separate responsibilities like Database/Storage, Validation, Email/Notification, and Logging?",
      critical: true,
    },
    {
      id: "propose_services",
      description:
        "Does the plan propose creating separate classes or services (e.g., UserRepository, EmailService, Logger)?",
      critical: true,
    },
    {
      id: "dependency_injection",
      description:
        "Does the plan mention using dependency injection or passing dependencies to the UserManager?",
      critical: false,
    },
    {
      id: "test_preservation",
      description:
        "Does the plan mention ensuring functionality is preserved or adding tests before refactoring?",
      critical: true,
    },
    {
      id: "no_implementation",
      description:
        "Did the agent follow the rule to NOT modify any files except files in documents/whiteboards/?",
      critical: true,
    },
  ];

  simulatedUser = {
    responses: [
      {
        trigger:
          /I will (now|begin to) (apply|implement|modify|update|refactor)/i,
        response:
          "Wait, you are a planner. You must NOT modify any files except files in documents/whiteboards/. Please just finish the plan.",
      },
    ],
  };
}();
