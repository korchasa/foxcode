import { BenchmarkSkillScenario } from "@bench/types.ts";

export const DenoDeployTroubleshootBench = new class
  extends BenchmarkSkillScenario {
  id = "flowai-skill-deno-deploy-troubleshoot";
  name = "Troubleshoot Deno Deploy with KV and .gitignore";
  skill = "flowai-skill-deno-deploy";
  agentsTemplateVars = {
    PROJECT_NAME: "DenoDeployApp",
    TOOLING_STACK: "- TypeScript\n- Deno\n- Deno Deploy",
    ARCHITECTURE:
      "- Deno KV for persistence\n- Deno Deploy for hosting\n- Playwright for testing",
  };

  userQuery =
    '/flowai-skill-deno-deploy My app uses Deno.openKv() and works locally with --unstable-kv, but when deployed to Deno Deploy it fails with "TypeError: Deno.openKv is not a function". Also, I have a large .playwright-browsers/ directory that causes slow uploads. How do I fix both issues?';

  checklist = [
    {
      id: "unstable_deno_json",
      description:
        'Did the agent recommend adding "unstable": ["kv"] to deno.json as the fix for the KV error (not a CLI flag)?',
      critical: true,
    },
    {
      id: "no_cli_unstable_flag",
      description:
        "Did the agent explain that deno deploy does NOT support --unstable-kv flags?",
      critical: true,
    },
    {
      id: "gitignore_solution",
      description:
        "Did the agent recommend adding .playwright-browsers/ to .gitignore to exclude it from uploads?",
      critical: true,
    },
    {
      id: "no_exclude_flag",
      description:
        "Did the agent mention (or avoid suggesting) that deno deploy does NOT support --exclude flag?",
      critical: false,
    },
    {
      id: "reads_project_files",
      description:
        "Did the agent read deno.json and/or src/main.ts to understand the project setup?",
      critical: false,
    },
  ];
}();
