import { BenchmarkSkillScenario } from "@bench/types.ts";

export const ManageGithubTicketsCreateIssueBench = new class
  extends BenchmarkSkillScenario {
  id = "flowai-skill-manage-github-tickets-create-issue";
  name = "Create GitHub Issue Using GODS Framework";
  skill = "flowai-skill-manage-github-tickets";
  agentsTemplateVars = {
    PROJECT_NAME: "AcmeBackend",
  };

  userQuery =
    "/flowai-skill-manage-github-tickets Create a GitHub issue for our CI/CD pipeline being broken. Jenkins plugin update caused 5 builds to fail. We need to restore builds within 1 hour. Repo: acme/backend.";

  interactive = true;
  userPersona =
    "You are a platform engineer who updated a Jenkins plugin and it broke CI. When asked for details, say the plugin is 'pipeline-utility-steps' updated from v2.15 to v2.16. Keep answers brief.";
  maxSteps = 15;

  checklist = [
    {
      id: "detects_tool",
      description:
        "Did the agent detect or attempt to use a GitHub tool (MCP create_issue, gh CLI, or explain it's unavailable)?",
      critical: true,
    },
    {
      id: "gods_goal",
      description:
        "Does the issue body contain a 'Goal' section that describes the business objective (e.g., restore CI/CD pipeline)?",
      critical: true,
    },
    {
      id: "gods_overview",
      description:
        "Does the issue body contain an 'Overview' section with context about what happened (plugin update, build failures)?",
      critical: true,
    },
    {
      id: "gods_definition_of_done",
      description:
        "Does the issue body contain a 'Definition of Done' section with measurable completion criteria?",
      critical: true,
    },
    {
      id: "gods_solution",
      description:
        "Does the issue body contain a 'Solution' section with actionable steps?",
      critical: false,
    },
    {
      id: "english_language",
      description: "Is the issue title and body written in English?",
      critical: true,
    },
  ];
}();
