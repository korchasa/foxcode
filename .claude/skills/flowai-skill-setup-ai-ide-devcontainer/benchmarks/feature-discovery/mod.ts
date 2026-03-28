import { BenchmarkSkillScenario } from "@bench/types.ts";

export const SetupDevcontainerFeatureDiscovery = new class
  extends BenchmarkSkillScenario {
  id = "flowai-skill-setup-ai-ide-devcontainer-feature-discovery";
  name =
    "Node.js fullstack with feature discovery (Postgres, Redis, Docker, direnv)";
  skill = "flowai-skill-setup-ai-ide-devcontainer";
  stepTimeoutMs = 420_000;
  agentsTemplateVars = {
    PROJECT_NAME: "NodeFullstack",
    TOOLING_STACK: "- TypeScript\n- Node.js\n- PostgreSQL\n- Redis",
  };

  userQuery =
    "/flowai-skill-setup-ai-ide-devcontainer Set up a devcontainer for this Node.js fullstack project with Claude Code. Accept all suggested features.";

  userPersona =
    `You are a developer with a Node.js fullstack project that uses PostgreSQL (via Prisma), Redis, Docker Compose, Playwright, AWS SDK, and direnv.
When asked about AI CLI, choose Claude Code.
When asked about global skills, decline.
When asked about security hardening/firewall, decline.
When asked about custom Dockerfile, decline.
When presented with feature suggestions, accept all of them.
Confirm any file creation prompts.`;

  checklist = [
    {
      id: "devcontainer_json_created",
      description:
        "Was `.devcontainer/devcontainer.json` created and is it valid JSON?",
      critical: true,
    },
    {
      id: "feature_suggestions_shown",
      description:
        "Did the agent present a list of discovered/suggested features to the user before generating config?",
      critical: true,
    },
    {
      id: "postgres_feature_suggested",
      description:
        "Was PostgreSQL feature suggested (detected from prisma schema or docker-compose)?",
      critical: true,
    },
    {
      id: "redis_feature_suggested",
      description:
        "Was Redis feature suggested (detected from ioredis dependency or docker-compose)?",
      critical: true,
    },
    {
      id: "docker_in_docker_suggested",
      description:
        "Was Docker-in-Docker feature suggested (detected from docker-compose.yml)?",
      critical: false,
    },
    {
      id: "direnv_feature_detected",
      description: "Was direnv feature detected and added (found .envrc file)?",
      critical: true,
    },
    {
      id: "features_in_config",
      description:
        "Does the final devcontainer.json include at least 2 features beyond the base template (common-utils, github-cli)?",
      critical: true,
    },
    {
      id: "detection_rationale",
      description:
        "Did the agent explain WHY each feature was suggested (which file/indicator triggered it)?",
      critical: false,
    },
    {
      id: "claude_code_as_feature",
      description:
        "Is Claude Code installed via a devcontainer registry feature (ghcr.io/.../claude-code) rather than raw curl/npm in postCreateCommand?",
      critical: false,
    },
    {
      id: "node_base_image",
      description: "Does devcontainer.json reference a Node.js base image?",
      critical: true,
    },
    {
      id: "no_hardcoded_secrets",
      description:
        "Are there no hardcoded API keys or tokens in any generated file?",
      critical: true,
    },
  ];
}();
