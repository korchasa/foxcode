import { BenchmarkSkillScenario } from "@bench/types.ts";

export const PlanDbFeatureBench = new class extends BenchmarkSkillScenario {
  id = "flowai-plan-db";
  name = "Plan Database Feature";
  skill = "flowai-plan";
  stepTimeoutMs = 300_000;
  agentsTemplateVars = {
    PROJECT_NAME: "TestProject",
    TOOLING_STACK: "- TypeScript\n- Deno\n- Prisma",
    generateDocuments: true,
  };

  userQuery =
    "/flowai-plan Plan adding a 'role' field to the User model. It should be an enum with values 'USER' and 'ADMIN', defaulting to 'USER'. Update the registration flow to support it.";

  checklist = [
    {
      id: "schema_update",
      description:
        "Does the plan include updating 'prisma/schema.prisma' with the new Role enum and field?",
      critical: true,
    },
    {
      id: "migration_step",
      description:
        "Does the plan include a step to create/run the database migration (e.g., 'prisma migrate')?",
      critical: true,
    },
    {
      id: "service_update",
      description:
        "Does the plan include updating 'src/user.service.ts' to accept and handle the optional role parameter?",
      critical: true,
    },
    {
      id: "default_value",
      description:
        "Does the plan mention setting the default value to 'USER' in the schema?",
      critical: true,
    },
  ];
}();
