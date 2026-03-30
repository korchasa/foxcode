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
    "ANTHROPIC_API_KEY": "${localEnv:ANTHROPIC_API_KEY}",
    "GITHUB_TOKEN": "${localEnv:GITHUB_TOKEN}"
  },

  "secrets": {
    "ANTHROPIC_API_KEY": {
      "description": "API key for Claude Code CLI (console.anthropic.com)"
    },
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

  "postCreateCommand": "{{dependency_install_command}}",
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

Docker named volumes are created with root ownership before `remoteUser` takes effect. AI CLI installers and extensions fail to write config/auth tokens without this fix. Each CLI install command in `postCreateCommand` MUST chain `sudo chown` first:
```jsonc
"postCreateCommand": {
  "claude-cli": "sudo chown {{remote_user}}:{{remote_user}} ~/.claude && curl -fsSL https://claude.ai/install.sh | bash",
  "claude-auth": "[ ! -f ~/.claude/.credentials.json ] && [ -s ~/.claude-auth-staging.json ] && cp ~/.claude-auth-staging.json ~/.claude/.credentials.json && chmod 600 ~/.claude/.credentials.json || true",
  "opencode-cli": "sudo chown {{remote_user}}:{{remote_user}} ~/.config/opencode && curl -fsSL https://opencode.ai/install | bash"
}
```

### Auth forwarding (Claude Code)

Auth tokens live in `~/.claude/.credentials.json` inside the config volume. On first container creation (empty volume), tokens are copied from the host Keychain staging file. On subsequent rebuilds, the volume already has tokens — copy is skipped.

**initializeCommand** (runs on host, macOS only):
```jsonc
"initializeCommand": "security find-generic-password -s 'Claude Code-credentials' -w > ~/.claude-auth-staging.json 2>/dev/null || echo '{}' > ~/.claude-auth-staging.json"
```

**postCreateCommand** (copy once if volume is empty):
```jsonc
"claude-auth": "[ ! -f ~/.claude/.credentials.json ] && [ -s ~/.claude-auth-staging.json ] && cp ~/.claude-auth-staging.json ~/.claude/.credentials.json && chmod 600 ~/.claude/.credentials.json || true"
```

See [auth-forwarding.md](auth-forwarding.md) for full architecture details and warnings.

**WARNING**: Do NOT set `CLAUDE_CONFIG_DIR` in `remoteEnv` — it redirects where Claude looks for `.credentials.json`, breaking the volume auth strategy.
