// FR-20.4 (greenfield interview integration) is NOT tested here.
// That path (flowai-init → devcontainer delegation) belongs to flowai-init benchmarks,
// not to devcontainer skill benchmarks. The skill itself is tested standalone.

import { BenchmarkSkillScenario } from "@bench/types.ts";

export const SetupDevcontainerDenoWithClaude = new class
  extends BenchmarkSkillScenario {
  id = "flowai-skill-setup-ai-ide-devcontainer-deno-claude";
  name = "Deno project with Claude Code, global skills, and firewall";
  skill = "flowai-skill-setup-ai-ide-devcontainer";
  stepTimeoutMs = 420_000;
  agentsTemplateVars = {
    PROJECT_NAME: "DenoSecureApp",
    TOOLING_STACK: "- TypeScript\n- Deno",
  };

  userQuery =
    "/flowai-skill-setup-ai-ide-devcontainer Set up a devcontainer for this Deno project with full Claude Code integration, global skills mounting, and security hardening.";

  userPersona =
    `You are a developer who wants a secure devcontainer for a Deno project with autonomous AI agent support.
When asked about AI CLI, choose Claude Code.
When asked about global skills, agree to mount host ~/.claude/ read-only.
When asked about security hardening/firewall, agree.
When asked about custom Dockerfile, agree (needed for Deno + firewall).
Confirm any file creation prompts.`;

  checklist = [
    {
      id: "devcontainer_json_created",
      description:
        "Was `.devcontainer/devcontainer.json` created and is it valid JSON?",
      critical: true,
    },
    {
      id: "deno_support",
      description:
        "Does the config include Deno support (deno feature from devcontainers-extra, or Deno in Dockerfile, or denoland base image)?",
      critical: true,
    },
    {
      id: "deno_extension",
      description: "Does the extensions list include `denoland.vscode-deno`?",
      critical: true,
    },
    {
      id: "claude_code_setup",
      description:
        "Is Claude Code CLI installation configured (native installer or npm install in Dockerfile or postCreateCommand)?",
      critical: true,
    },
    {
      id: "global_skills_mount",
      description:
        "Is there a bind mount for host ~/.claude/ (read-only) to a separate path like ~/.claude-host?",
      critical: true,
    },
    {
      id: "firewall_script",
      description:
        "Was `init-firewall.sh` created with default-deny policy and domain allowlist?",
      critical: true,
    },
    {
      id: "net_admin_cap",
      description:
        "Does devcontainer.json include NET_ADMIN capability in runArgs?",
      critical: true,
    },
    {
      id: "dockerfile_created",
      description: "Was a Dockerfile created in .devcontainer/?",
      critical: true,
    },
    {
      id: "anthropic_api_key_env",
      description:
        "Does remoteEnv reference ANTHROPIC_API_KEY via ${localEnv:ANTHROPIC_API_KEY}?",
      critical: true,
    },
    {
      id: "deno_settings",
      description:
        "Does customizations.vscode.settings include `deno.enable: true`?",
      critical: false,
    },
    {
      id: "no_hardcoded_secrets",
      description:
        "Are there no hardcoded API keys or tokens in any generated file?",
      critical: true,
    },
    {
      id: "global_skills_sync_in_post_start",
      description:
        "Is the global skills sync command (cp -rL from ~/.claude-host) placed in postStartCommand (NOT postCreateCommand), so it runs on every container restart?",
      critical: true,
    },
    {
      id: "symlink_dereference",
      description:
        "Does the skills sync command use `cp -rL` (with -L flag to dereference symlinks) rather than plain `cp -r`?",
      critical: true,
    },
    {
      id: "feature_discovery_performed",
      description:
        "Did the agent scan for additional devcontainer features beyond the base stack (e.g., checking for databases, tools, secondary runtimes)?",
      critical: false,
    },
    {
      id: "auth_forwarding_initialize_command",
      description:
        "Does devcontainer.json include an `initializeCommand` that extracts Claude Code tokens from macOS Keychain using `security find-generic-password -s 'Claude Code-credentials'`?",
      critical: true,
    },
    {
      id: "auth_staging_mount",
      description:
        "Is there a bind mount for the auth staging file (e.g., `~/.claude-auth-staging.json`) from host to container, read-only?",
      critical: true,
    },
    {
      id: "auth_copy_in_post_create",
      description:
        "Does postCreateCommand include a conditional copy of auth staging file to `~/.claude/.credentials.json` (only if .credentials.json doesn't already exist in volume)?",
      critical: true,
    },
    {
      id: "no_claude_config_dir_env",
      description:
        "Does remoteEnv NOT contain CLAUDE_CONFIG_DIR? Setting it breaks the volume auth strategy.",
      critical: true,
    },
  ];
}();
