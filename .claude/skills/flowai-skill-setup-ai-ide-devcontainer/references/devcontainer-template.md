# devcontainer.json Template Logic

## Image-Based (default, no custom Dockerfile)

```jsonc
{
  "name": "{{project_name}}",
  "image": "{{base_image}}",

  "features": {
    // Always include
    "ghcr.io/devcontainers/features/common-utils:2": {
      "installZsh": true,
      "configureZshAsDefaultShell": true
    },
    "ghcr.io/devcontainers/features/github-cli:1": {}
    // Stack-specific features added here (e.g., Deno feature)
    // Secondary stack features added here (e.g., Node feature for Deno+Node projects)
    // AI CLI features added here (e.g., opencode — from registry; Claude Code installed via postCreateCommand)
    // Discovered features from project scan (Step 2) added here
  },

  "customizations": {
    "vscode": {
      "extensions": [
        // Stack extensions (from SKILL.md table)
        // AI extensions (from SKILL.md table)
        // Always: "eamodio.gitlens", "editorconfig.editorconfig"
      ],
      "settings": {
        // Stack-specific settings (see below)
      }
    }
  },

  "remoteEnv": {
    // IMPORTANT: Do NOT include ANTHROPIC_API_KEY here by default.
    // An empty string (unset on host) triggers API-key auth mode and breaks OAuth.
    // Only add ANTHROPIC_API_KEY if the user explicitly provides an API key.
    // GITHUB_TOKEN is required for gh CLI auth + git credential helper (setup-container.sh).
    "GITHUB_TOKEN": "${localEnv:GITHUB_TOKEN}"
  },

  "secrets": {
    // Add ANTHROPIC_API_KEY here ONLY if the user chose API-key auth (not OAuth)
    "GITHUB_TOKEN": {
      "description": "GitHub PAT for gh CLI"
    }
  },

  "mounts": [
    // Config persistence volume
    // Auth forwarding staging mount (if Claude Code selected)
    // Global skills bind mount (if enabled)
  ],

  // Runs on HOST before container creation (macOS only — extracts Keychain tokens)
  "initializeCommand": "security find-generic-password -s 'Claude Code-credentials' -w > ~/.claude-auth-staging.json 2>/dev/null || echo '{}' > ~/.claude-auth-staging.json",

  // Object form — each key runs in parallel. Order within a key is sequential.
  // Volume ownership: Docker named volumes are created as root. Must chown BEFORE CLI install/auth writes.
  "postCreateCommand": {
    "deps": "{{dependency_install_command}}",
    // Always include — sets up gh auth + git credential helper using GITHUB_TOKEN:
    "setup": ".devcontainer/setup-container.sh",
    // Add per-CLI entries below only for selected AI CLIs:
    // "claude-chown": "sudo chown -R {{remote_user}}:{{remote_user}} ~/.claude",
    // "claude-cli": "curl -fsSL https://claude.ai/install.sh | bash"
  },
  "postStartCommand": "git config --global --add safe.directory ${containerWorkspaceFolder}",
  "remoteUser": "{{remote_user}}"
}
```

## Dockerfile-Based (custom setup)

Replace `"image"` with:
```jsonc
{
  "build": {
    "dockerfile": "Dockerfile",
    "args": {}
  }
}
```

## With Firewall (security hardening)

Add:
```jsonc
{
  "runArgs": [
    "--cap-add=NET_ADMIN",
    "--cap-add=NET_RAW"
  ],
  "postStartCommand": {
    "git-safe": "git config --global --add safe.directory ${containerWorkspaceFolder}",
    "firewall": "sudo /usr/local/bin/init-firewall.sh"
  }
}
```

## Stack-Specific Settings

### Deno
```jsonc
"settings": {
  "deno.enable": true,
  "deno.lint": true,
  "editor.defaultFormatter": "denoland.vscode-deno",
  "editor.formatOnSave": true
}
```

### Node/TS (ESLint + Prettier)
```jsonc
"settings": {
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  }
}
```

### Python
```jsonc
"settings": {
  "python.defaultInterpreterPath": "/usr/local/bin/python",
  "editor.defaultFormatter": "ms-python.python",
  "editor.formatOnSave": true
}
```

### Go
```jsonc
"settings": {
  "go.toolsManagement.autoUpdate": true,
  "editor.defaultFormatter": "golang.go",
  "editor.formatOnSave": true
}
```

### Rust
```jsonc
"settings": {
  "rust-analyzer.check.command": "clippy",
  "editor.defaultFormatter": "rust-lang.rust-analyzer",
  "editor.formatOnSave": true
}
```

## Mounts Configuration

Add only mounts for selected AI CLIs.

### Claude Code (when selected)
```jsonc
// Config persistence volume (auth tokens in .credentials.json survive here)
"source=claude-config-${devcontainerId},target=/home/{{remote_user}}/.claude,type=volume"
// Auth forwarding: host Keychain tokens staged here (macOS only, read-only)
"source=${localEnv:HOME}/.claude-auth-staging.json,target=/home/{{remote_user}}/.claude-auth-staging.json,type=bind,readonly"
// Global skills from host (if enabled, local dev only)
"source=${localEnv:HOME}/.claude,target=/home/{{remote_user}}/.claude-host,type=bind,readonly"
```

### OpenCode (when selected)
```jsonc
// Config persistence volume
"source=opencode-config-${devcontainerId},target=/home/{{remote_user}}/.config/opencode,type=volume"
// Global skills from host (if enabled, local dev only)
"source=${localEnv:HOME}/.config/opencode,target=/home/{{remote_user}}/.config/opencode-host,type=bind,readonly"
```

### Bash history persistence (always)
```jsonc
"source=bashhistory-${devcontainerId},target=/commandhistory,type=volume"
```

### Volume ownership fix

Docker named volumes are created with root ownership before `remoteUser` takes effect. AI CLI installers and auth token writes fail without this fix.

**This is integrated into the main template** via `postCreateCommand` object form. Each AI CLI gets a chown entry that runs BEFORE the CLI install entry. See main template above.

### Auth forwarding (Claude Code) via setup-container.sh

Auth tokens live in `~/.claude/.credentials.json` inside the config volume. On first container creation (empty volume), tokens are copied from the host Keychain staging file.

Instead of fragile inline shell one-liners, generate a **setup-container.sh** script:

```bash
#!/usr/bin/env bash
set -euo pipefail

# --- Claude Code auth (if selected) ---
# Copy auth tokens from host Keychain staging file into the config volume.
STAGING="$HOME/.claude-auth-staging.json"
TARGET="$HOME/.claude/.credentials.json"

if [ -s "$STAGING" ]; then
  cp "$STAGING" "$TARGET"
  chmod 600 "$TARGET"
  echo "[setup-container] Claude auth tokens copied from host Keychain staging."
else
  echo "[setup-container] No Claude auth staging file — authenticate manually: claude login"
fi

# --- GitHub CLI + git credential helper ---
# gh auth login enables `gh` CLI commands (gh pr, gh issue, etc.)
# gh auth setup-git registers credential helper for HTTPS git operations (push, pull, fetch)
# Without this, HTTPS remotes fail with 401 and `gh` commands fail with "not logged in"
if [ -n "${GITHUB_TOKEN:-}" ]; then
  echo "$GITHUB_TOKEN" | gh auth login --with-token
  gh auth setup-git
  echo "[setup-container] gh CLI authenticated + git credential helper configured."
else
  echo "[setup-container] No GITHUB_TOKEN — gh CLI not authenticated."
  echo "[setup-container] Run 'gh auth login' manually for gh commands and HTTPS git operations."
fi
```

Place this script at `.devcontainer/setup-container.sh` and make it executable (`chmod +x`).

**postCreateCommand** references (example with Claude Code + OpenCode):
```jsonc
"postCreateCommand": {
  "deps": "{{dependency_install_command}}",
  "setup": ".devcontainer/setup-container.sh",
  "claude-chown": "sudo chown -R {{remote_user}}:{{remote_user}} ~/.claude",
  "claude-cli": "curl -fsSL https://claude.ai/install.sh | bash",
  "opencode-chown": "sudo chown -R {{remote_user}}:{{remote_user}} ~/.config/opencode",
  "opencode-cli": "curl -fsSL https://opencode.ai/install | bash",
  "flowai-cli": "deno install -g -A -f jsr:@korchasa/flowai"
}
```

**initializeCommand** (runs on host, macOS only):
```jsonc
"initializeCommand": "security find-generic-password -s 'Claude Code-credentials' -w > ~/.claude-auth-staging.json 2>/dev/null || echo '{}' > ~/.claude-auth-staging.json"
```

See [auth-forwarding.md](auth-forwarding.md) for full architecture details and warnings.

**WARNING**: Do NOT set `CLAUDE_CONFIG_DIR` in `remoteEnv` — it redirects where Claude looks for `.credentials.json`, breaking the volume auth strategy.

**WARNING**: Do NOT set `ANTHROPIC_API_KEY` to empty string in `remoteEnv` — Claude Code interprets it as API-key auth attempt and fails. Only include `ANTHROPIC_API_KEY` if the user explicitly provides an API key. See [auth-forwarding.md](auth-forwarding.md) § Critical Warnings.

**NOTE**: flowai needs no mounts or volumes — it reads `.flowai.yaml` from the project workspace. For non-Deno stacks, add `ghcr.io/devcontainers-extra/features/deno:latest` to the features block.

### GitHub CLI auth and git credential helper

The `github-cli:1` feature installs `gh` binary but does NOT configure authentication. Without explicit setup:
- `gh` CLI commands (`gh pr`, `gh issue`) fail with "not logged in"
- HTTPS git operations fail with 401 (no credential helper registered)

`setup-container.sh` handles this automatically via `GITHUB_TOKEN`:
1. `gh auth login --with-token` — authenticates `gh` CLI
2. `gh auth setup-git` — registers `gh` as git credential helper for `https://github.com`

**SSH vs HTTPS remote URLs**: `gh auth setup-git` registers a credential helper scoped to `https://github.com`. It does NOT affect SSH transport. If the repository on the host was cloned via SSH (`git@github.com:user/repo.git`), the remote URL is preserved in the container (bind mount shares `.git/config`). SSH operations rely on VS Code's SSH agent forwarding from the host. If agent forwarding is unavailable (no agent running, non-VS Code environment), the user must either:
- Switch to HTTPS: `git remote set-url origin https://github.com/user/repo.git`
- Or configure SSH keys inside the container
