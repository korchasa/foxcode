import { BenchmarkSkillScenario } from "@bench/types.ts";

export const SetupDevcontainerOpenCodeMultiCli = new class
  extends BenchmarkSkillScenario {
  id = "flowai-skill-setup-ai-ide-devcontainer-opencode-multi-cli";
  name = "Python project with Claude Code + OpenCode and global skills";
  skill = "flowai-skill-setup-ai-ide-devcontainer";
  stepTimeoutMs = 420_000;
  interactive = true;
  maxSteps = 15;
  agentsTemplateVars = {
    PROJECT_NAME: "PyMultiCli",
    TOOLING_STACK: "- Python",
  };

  userQuery =
    "/flowai-skill-setup-ai-ide-devcontainer Set up a devcontainer for this Python project. Install both Claude Code and OpenCode. Mount global skills from host. No firewall. No custom Dockerfile.";

  userPersona =
    `You are a developer who wants a Python devcontainer with both Claude Code and OpenCode AI CLIs.
When asked about AI CLI, choose both Claude Code and OpenCode.
When asked about global skills, agree to mount host config directories read-only.
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
      id: "python_base_image",
      description:
        "Does devcontainer.json reference a Python base image (contains 'python' in image name)?",
      critical: true,
    },
    {
      id: "claude_code_configured",
      description:
        "Is Claude Code configured (via registry feature like ghcr.io/.../claude-code, or npm/curl install in postCreateCommand)?",
      critical: true,
    },
    {
      id: "opencode_configured",
      description:
        "Is OpenCode configured (via registry feature like ghcr.io/.../opencode, or curl install in postCreateCommand)?",
      critical: true,
    },
    {
      id: "claude_global_skills_mount",
      description:
        "Is there a bind mount for host ~/.claude/ (read-only) to a separate path like ~/.claude-host?",
      critical: true,
    },
    {
      id: "opencode_global_skills_mount",
      description:
        "Is there a bind mount for host ~/.config/opencode/ (read-only) to a separate path like ~/.config/opencode-host?",
      critical: true,
    },
    {
      id: "anthropic_api_key_env",
      description:
        "Does remoteEnv reference ANTHROPIC_API_KEY via ${localEnv:ANTHROPIC_API_KEY}?",
      critical: true,
    },
    {
      id: "post_start_skills_sync",
      description:
        "Does postStartCommand sync global skills for BOTH Claude Code (cp -rL ~/.claude-host/skills ~/.claude/skills) and OpenCode (cp -rL ~/.config/opencode-host/skills ~/.config/opencode/skills)?",
      critical: true,
    },
    {
      id: "no_hardcoded_secrets",
      description:
        "Are there no hardcoded API keys or tokens in any generated file?",
      critical: true,
    },
    {
      id: "python_deps_install",
      description:
        "Does postCreateCommand include `pip install` (or equivalent Python dependency install)?",
      critical: false,
    },
    {
      id: "no_claude_config_dir_env",
      description:
        "Does remoteEnv NOT contain CLAUDE_CONFIG_DIR? Setting it breaks the volume auth strategy.",
      critical: true,
    },
  ];
}();
