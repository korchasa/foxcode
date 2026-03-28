import { BenchmarkSkillScenario } from "@bench/types.ts";

export const DenoCliTestPermsBench = new class extends BenchmarkSkillScenario {
  id = "flowai-skill-deno-cli-test-permissions";
  name = "Run Deno tests and diagnose permission requirements";
  skill = "flowai-skill-deno-cli";
  agentsTemplateVars = {
    PROJECT_NAME: "DenoKvServer",
    TOOLING_STACK: "- TypeScript\n- Deno",
    ARCHITECTURE: "- Deno KV for persistence\n- JSR for dependency management",
  };

  userQuery =
    "/flowai-skill-deno-cli I want to run the tests for this project. The server uses Deno KV. What permissions do I need and what is the correct command? Also, how do I add a new dependency from JSR?";

  checklist = [
    {
      id: "reads_deno_json",
      description:
        "Did the agent read deno.json to understand the project configuration and existing tasks?",
      critical: true,
    },
    {
      id: "suggests_task_test",
      description:
        'Did the agent suggest using "deno task test" as the preferred way to run tests (since a task is defined)?',
      critical: true,
    },
    {
      id: "mentions_unstable_kv",
      description:
        "Did the agent mention that Deno KV requires --unstable-kv flag or unstable config in deno.json?",
      critical: false,
    },
    {
      id: "explains_permissions",
      description:
        "Did the agent explain the relevant permissions (--allow-read, --allow-env, --allow-net) and their purpose?",
      critical: false,
    },
    {
      id: "deno_add_jsr",
      description:
        'Did the agent explain "deno add jsr:@scope/package" as the way to add a JSR dependency?',
      critical: false,
    },
  ];
}();
