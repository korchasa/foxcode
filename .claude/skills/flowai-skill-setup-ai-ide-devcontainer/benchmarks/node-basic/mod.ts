import { BenchmarkSkillScenario } from "@bench/types.ts";

export const SetupDevcontainerNodeBasic = new class
  extends BenchmarkSkillScenario {
  id = "flowai-skill-setup-ai-ide-devcontainer-node-basic";
  name = "Basic Node.js devcontainer setup";
  skill = "flowai-skill-setup-ai-ide-devcontainer";
  stepTimeoutMs = 420_000;
  agentsTemplateVars = {
    PROJECT_NAME: "NodeExpressApp",
    TOOLING_STACK: "- TypeScript\n- Node.js\n- Express",
  };

  userQuery =
    "/flowai-skill-setup-ai-ide-devcontainer Set up a devcontainer for this Node.js project. Use Claude Code as AI CLI. No global skills mount. No firewall. No custom Dockerfile.";

  userPersona =
    `You are a developer who wants a simple devcontainer for a Node.js Express project.
When asked about AI CLI, choose Claude Code.
When asked about global skills, decline.
When asked about security hardening/firewall, decline.
When asked about custom Dockerfile, decline.
Confirm any file creation prompts.`;

  checklist = [
    {
      id: "devcontainer_json_created",
      description:
        "Was `.devcontainer/devcontainer.json` created and is it valid JSON?",
      critical: true,
    },
    {
      id: "node_base_image",
      description:
        "Does devcontainer.json reference a Node.js base image (contains 'node' or 'typescript-node' in image name)?",
      critical: true,
    },
    {
      id: "claude_code_extension",
      description: "Does the extensions list include `anthropic.claude-code`?",
      critical: true,
    },
    {
      id: "anthropic_api_key_env",
      description:
        "Does remoteEnv or containerEnv reference ANTHROPIC_API_KEY via ${localEnv:ANTHROPIC_API_KEY}?",
      critical: true,
    },
    {
      id: "post_create_command",
      description:
        "Does postCreateCommand include `npm install` (or equivalent dependency install)?",
      critical: true,
    },
    {
      id: "no_hardcoded_secrets",
      description:
        "Are there no hardcoded API keys or tokens in any generated file?",
      critical: true,
    },
    {
      id: "remote_user_set",
      description: "Is remoteUser set to a non-root user (e.g., 'node')?",
      critical: false,
    },
    {
      id: "no_dockerfile",
      description:
        "Was NO Dockerfile generated (user declined custom Dockerfile)?",
      critical: false,
    },
    {
      id: "feature_discovery_performed",
      description:
        "Did the agent scan for additional devcontainer features beyond the base stack (e.g., checking for databases, tools, secondary runtimes)?",
      critical: false,
    },
  ];
}();
