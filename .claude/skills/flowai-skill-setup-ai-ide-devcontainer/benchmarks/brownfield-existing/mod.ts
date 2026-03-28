import { BenchmarkSkillScenario } from "@bench/types.ts";

export const SetupDevcontainerBrownfield = new class
  extends BenchmarkSkillScenario {
  id = "flowai-skill-setup-ai-ide-devcontainer-brownfield";
  name = "Brownfield: existing devcontainer in Python project";
  skill = "flowai-skill-setup-ai-ide-devcontainer";
  stepTimeoutMs = 420_000;
  interactive = true;
  maxSteps = 15;
  agentsTemplateVars = {
    PROJECT_NAME: "PyBrownfield",
    TOOLING_STACK: "- Python",
  };

  userQuery =
    "/flowai-skill-setup-ai-ide-devcontainer Update the devcontainer config for this Python project. Add Claude Code support.";

  userPersona =
    `You are a developer with an existing (outdated) devcontainer who wants to modernize it.
When asked about AI CLI, choose Claude Code.
When asked about global skills, decline.
When asked about security hardening/firewall, decline.
When asked about custom Dockerfile, decline.
When shown diffs of existing files, confirm the overwrite.`;

  checklist = [
    {
      id: "diff_shown",
      description:
        "Did the agent show a diff or comparison of the existing devcontainer.json before overwriting?",
      critical: true,
    },
    {
      id: "confirmation_asked",
      description:
        "Did the agent ask for confirmation before overwriting the existing config?",
      critical: true,
    },
    {
      id: "python_base_image",
      description:
        "Does the updated devcontainer.json reference a Python base image (contains 'python' in image name)?",
      critical: true,
    },
    {
      id: "claude_code_extension",
      description: "Does the extensions list include `anthropic.claude-code`?",
      critical: true,
    },
    {
      id: "pip_install",
      description:
        "Does postCreateCommand include pip install or equivalent Python dependency command?",
      critical: true,
    },
    {
      id: "valid_json",
      description: "Is the final devcontainer.json valid JSON?",
      critical: true,
    },
    {
      id: "anthropic_api_key_env",
      description:
        "Does remoteEnv reference ANTHROPIC_API_KEY via ${localEnv:ANTHROPIC_API_KEY}?",
      critical: true,
    },
    {
      id: "feature_discovery_performed",
      description:
        "Did the agent scan for additional devcontainer features beyond the base stack (e.g., checking for databases, tools, secondary runtimes)?",
      critical: false,
    },
  ];
}();
