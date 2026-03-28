import { BenchmarkSkillScenario } from "@bench/types.ts";

export const MaintenanceBasicBench = new class extends BenchmarkSkillScenario {
  id = "flowai-maintenance-basic";
  name = "Basic Project Audit";
  skill = "flowai-maintenance";
  stepTimeoutMs = 420_000;
  agentsTemplateVars = {
    PROJECT_NAME: "MaintenanceTarget",
    TOOLING_STACK: "- TypeScript",
  };

  userQuery =
    "/flowai-maintenance. Use only standard CLI tools like cat, ls, grep.";

  checklist = [
    {
      id: "whiteboard_report",
      description:
        "Did the agent create a maintenance report in 'documents/whiteboards/'? (Check logs for whiteboard content)",
      critical: true,
    },
    {
      id: "todo_found",
      description: "Did the report identify the TODO in src/main.ts?",
      critical: true,
    },
    {
      id: "god_object_found",
      description:
        "Did the report identify SystemManager as a God Object candidate?",
      critical: true,
    },
    {
      id: "unused_export_found",
      description: "Did the report identify unusedExport?",
      critical: true,
    },
  ];
}();
