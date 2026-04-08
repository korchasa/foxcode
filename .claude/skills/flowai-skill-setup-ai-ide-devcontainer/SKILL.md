---
name: flowai-skill-setup-ai-ide-devcontainer
description: Set up .devcontainer for AI IDE development. Generates devcontainer.json and optional Dockerfile for project tech stack, AI CLI integration (Claude Code, OpenCode), secrets, skill mounting, and security hardening. Use for AI-assisted devcontainer setup or flowai-init delegation.
---

# AI Devcontainer Setup

Creates a `.devcontainer/` configuration for AI-agent-driven development.

**Architecture**: VS Code or Cursor **opens** the devcontainer (they support the devcontainer spec natively). AI tools work **inside** the container in two modes:
- **VS Code extensions** (e.g., `anthropic.claude-code`, `github.copilot`) — installed automatically via `customizations.vscode.extensions`, share the same container config and env vars
- **CLI/TUI tools** (e.g., `claude` CLI, `opencode` CLI) — run in the container terminal, use the same `~/.claude/` or `~/.config/opencode/` config

Both modes share config directories, env vars, and global skills. This skill configures all layers.

## Prerequisites

- Project root is identifiable (has `package.json`, `deno.json`, `go.mod`, `Cargo.toml`, `pyproject.toml`, or similar)
- User has confirmed they want a devcontainer

## Workflow

### Step 1: Detect Project Stack

Scan the project root for stack indicators:

| Indicator File | Stack | Base Image |
|---|---|---|
| `deno.json` / `deno.jsonc` | Deno | `mcr.microsoft.com/devcontainers/base:ubuntu` + Deno feature |
| `package.json` / `tsconfig.json` | Node/TS | `mcr.microsoft.com/devcontainers/typescript-node` |
| `pyproject.toml` / `requirements.txt` / `setup.py` | Python | `mcr.microsoft.com/devcontainers/python` |
| `go.mod` | Go | `mcr.microsoft.com/devcontainers/go` |
| `Cargo.toml` | Rust | `mcr.microsoft.com/devcontainers/rust` |
| None / mixed | Generic | `mcr.microsoft.com/devcontainers/base:ubuntu` |

If multiple stacks detected, ask user which is primary. Secondary stacks will be added as features.

### Step 2: Discover Relevant Features

Scan the project for indicators that map to devcontainer features beyond the base stack. Use the indicator→need mapping in [references/features-catalog.md](references/features-catalog.md), then search https://containers.dev/features for matching feature IDs.

1. **Scan** project root and common subdirs for indicator files/patterns (see catalog for full mapping)
2. **Map** indicators to needs (e.g., `pnpm-lock.yaml` → need pnpm, `*.tf` → need Terraform)
3. **Search** https://containers.dev/features for features matching each identified need. Use latest versions
4. **Filter** out features already covered by the primary stack's base image (e.g., skip Node feature if Node is primary)
5. **Classify** matches:
   - **auto**: high-confidence matches (secondary runtimes, build tools detected by lockfiles) — add without asking
   - **suggest**: optional/heavy features (databases, Docker-in-Docker, cloud CLIs) — present to user for confirmation
6. **Present** grouped list to user (see catalog for format). Show what was detected and why (which indicator file triggered each suggestion)
7. **User confirms** or customizes the list. Confirmed features are merged into the `features` block in step 5 (Generate Configuration)

Skip this step only if user explicitly provided a complete feature list in their request.

### Step 3: Detect Existing Configuration

Check if `.devcontainer/` exists:
- **If exists**:
  1. Read current `devcontainer.json` and display it to the user.
  2. **If the user reports a problem with the existing config**: Ask "What exactly is not working and what error do you see?" BEFORE proposing any fix. Do not assume the root cause — diagnose first.
  3. After generating the new version (Step 5), show a **diff** (old vs new) to the user.
  4. **MANDATORY**: Ask for explicit per-file confirmation before overwriting. If user declines — **abort**, do not proceed to writing files.
- **If not exists**: proceed to generation.

### Step 4: Determine Capabilities

Ask the user (skip items already answered in prior context):

1. **AI CLI tools** (multi-select): "Which AI CLI tools to install in the container?"
   - Claude Code — via `postCreateCommand` install script (see Claude Code § Install) + config volume + `ANTHROPIC_API_KEY`
   - OpenCode — via registry feature + config volume + `ANTHROPIC_API_KEY` (or other provider key)
   - Cursor CLI, Gemini CLI — via registry features
   - flowai — via `deno install` in `postCreateCommand` (requires Deno runtime; auto-added as feature for non-Deno stacks)
   - Both/multiple — installs and configures all selected
   - None — skip AI CLI setup
2. **Global skills**: "Mount host AI config directories into the container for access to global skills/settings? (read-only)"
   - Yes (default for local dev) — adds bind mounts for selected AI CLIs' config dirs
   - No — skip
3. **Security hardening**: "Add network firewall (default-deny + allowlist)? Recommended for autonomous agent mode."
   - Yes — generates `init-firewall.sh`, adds `NET_ADMIN`/`NET_RAW` capabilities
   - No (default) — skip
4. **Custom Dockerfile**: "Need additional system packages or non-standard setup?"
   - Yes — generates Dockerfile (required if firewall is enabled)
   - No (default) — use image + features only

### Step 5: Generate Configuration

#### 4.1 devcontainer.json

Generate using the template logic in [references/devcontainer-template.md](references/devcontainer-template.md).

Key structure:
```jsonc
{
  "name": "<project-name>",
  // Image-based OR Dockerfile-based (see step 4.4)
  "image": "<base-image>",  // OR "build": { "dockerfile": "Dockerfile" }
  "features": { /* stack features + common-utils + github-cli */ },
  "customizations": {
    "vscode": {
      "extensions": [ /* stack extensions + AI extensions */ ],
      "settings": { /* stack-specific settings */ }
    }
  },
  "remoteEnv": {
    // WARNING: Do NOT include ANTHROPIC_API_KEY unless user explicitly provides an API key.
    // An empty value (unset on host) breaks OAuth by triggering API-key auth mode.
    // See references/auth-forwarding.md § Critical Warnings.
    "GITHUB_TOKEN": "${localEnv:GITHUB_TOKEN}"
  },
  "secrets": {
    // Add ANTHROPIC_API_KEY ONLY if user chose API-key auth (not OAuth)
    "GITHUB_TOKEN": {
      "description": "GitHub PAT for gh CLI"
    }
  },
  "mounts": [ /* global config mount if enabled */ ],
  // Object form for parallel execution. Volume chown MUST precede CLI install.
  // setup-container.sh handles gh auth + Claude auth (see references/devcontainer-template.md)
  "postCreateCommand": {
    "deps": "<dependency-install-command>",
    "setup": ".devcontainer/setup-container.sh",
    "claude-chown": "sudo chown -R <user>:<user> ~/.claude",
    "claude-cli": "curl -fsSL https://claude.ai/install.sh | bash"
  },
  "postStartCommand": "git config --global --add safe.directory ${containerWorkspaceFolder}",
  "remoteUser": "<non-root-user>"
}
```

#### 4.2 Dockerfile (if custom)

Generate only when user chose custom Dockerfile in step 4.4. See [references/dockerfile-patterns.md](references/dockerfile-patterns.md).

#### 4.3 init-firewall.sh (if security hardening)

Generate only when user chose firewall in step 4.3. See [references/firewall-template.md](references/firewall-template.md).

### Step 6: Write Files

1. Create `.devcontainer/` directory if missing
2. Write `.devcontainer/devcontainer.json`
3. Write `.devcontainer/Dockerfile` (if custom)
4. Write `.devcontainer/init-firewall.sh` (if firewall), make executable
5. Write `.devcontainer/setup-container.sh` (if Claude Code selected or github-cli feature included), make executable. See [references/devcontainer-template.md](references/devcontainer-template.md) § Auth forwarding via setup-container.sh

### Step 7: Verify

- [ ] `.devcontainer/devcontainer.json` is valid JSON (parse it)
- [ ] If Dockerfile exists: no syntax errors (check `FROM` line present)
- [ ] If `init-firewall.sh` exists: has shebang and `set -euo pipefail`
- [ ] If `setup-container.sh` exists: has shebang, `set -euo pipefail`, and is executable
- [ ] `remoteUser` matches the user in the base image (e.g., `node` for Node images, `vscode` for mcr base images)
- [ ] No secrets/API keys hardcoded in any generated file
- [ ] `remoteEnv` does NOT contain `ANTHROPIC_API_KEY` unless user explicitly chose API-key auth
- [ ] If `setup-container.sh` includes gh auth: `GITHUB_TOKEN` is in `remoteEnv` (required for `gh auth login --with-token`)
- [ ] If `setup-container.sh` includes gh auth: script calls both `gh auth login --with-token` AND `gh auth setup-git` (the latter registers credential helper for HTTPS git operations)
- [ ] **End-to-end (if devcontainer CLI available)**: Run `devcontainer up --workspace-folder .` and verify container starts. If Claude Code was selected, run `devcontainer exec --workspace-folder . claude auth status` to verify auth works. This catches volume ownership, auth forwarding, and permission issues that static checks miss.

### Step 8: Post-Setup Notes

Display relevant notes to the user after generation:

If Claude Code was selected:

> **Claude Code auth**: After the container starts, open a terminal inside it and run `claude` to log in via OAuth. Auth forwarding from macOS Keychain may handle this automatically, but if Claude Code reports auth errors, a manual `claude login` in the container terminal will fix it. Credentials are persisted in the config volume and survive container rebuilds.

Always (github-cli feature is always included):

> **GitHub CLI & git auth**: `setup-container.sh` automatically runs `gh auth login` + `gh auth setup-git` using `GITHUB_TOKEN` from `remoteEnv`. This enables both `gh` CLI commands (`gh pr`, `gh issue`, etc.) and git credential helper for HTTPS operations (`git push`, `git pull`). If `GITHUB_TOKEN` is not set on the host, run `gh auth login` manually in the container.
>
> **SSH vs HTTPS remotes**: The git credential helper configured by `gh auth setup-git` works only with HTTPS URLs. If the repository was cloned on the host via SSH (`git@github.com:user/repo.git`), git operations inside the container may still work via VS Code's SSH agent forwarding. However, if SSH agent forwarding is unavailable, switch the remote to HTTPS: `git remote set-url origin https://github.com/user/repo.git`

If flowai was selected:

> **flowai CLI**: flowai is installed globally via Deno. Run `flowai sync` in the container terminal to sync skills/agents. The `.flowai.yaml` config is read from the project workspace root.

---

## Stack Reference

### Features by Stack

| Stack | Features to Add |
|---|---|
| Deno | `ghcr.io/devcontainers-extra/features/deno:latest` |
| Node/TS | (included in base image) |
| Python | (included in base image) |
| Go | (included in base image) |
| Rust | (included in base image) |
| Common (always) | `ghcr.io/devcontainers/features/common-utils:2`, `ghcr.io/devcontainers/features/github-cli:1` |
| Secondary Node | `ghcr.io/devcontainers/features/node:1` (when Node needed alongside non-Node primary) |
| Discovered | Additional features from [references/features-catalog.md](references/features-catalog.md) based on project scan (Step 2) |

### Extensions by Stack

| Stack | Extensions |
|---|---|
| Deno | `denoland.vscode-deno` |
| Node/TS | `dbaeumer.vscode-eslint`, `esbenp.prettier-vscode` |
| Python | `ms-python.python`, `ms-python.vscode-pylance` |
| Go | `golang.go` |
| Rust | `rust-lang.rust-analyzer` |
| Common (always) | `eamodio.gitlens`, `editorconfig.editorconfig` |

### AI CLI Extensions (VS Code/Cursor)

| Tool | Extension ID | Notes |
|---|---|---|
| Claude Code | `anthropic.claude-code` | IDE extension + CLI inside container |
| GitHub Copilot | `github.copilot`, `github.copilot-chat` | IDE extension only |

> OpenCode is a standalone TUI/CLI — no VS Code extension. It runs in the container terminal.

### postCreateCommand by Stack

| Stack | Command |
|---|---|
| Deno | `deno install` or `deno cache` (check deno.json for deps) |
| Node/TS | `npm install` or `yarn install` or `pnpm install` (match lockfile) |
| Python | `pip install -r requirements.txt` or `pip install -e .` (match project) |
| Go | `go mod download` |
| Rust | `cargo fetch` |

### remoteUser by Base Image

| Base Image Pattern | remoteUser |
|---|---|
| `mcr.microsoft.com/devcontainers/*` | `vscode` |
| `node:*` | `node` |
| `denoland/deno:*` | `deno` |
| `debian:*` / `ubuntu:*` | Create non-root user in Dockerfile |

---

## AI CLI Setup Reference

Each AI CLI has its own installation, config persistence, and global skills pattern. Apply only for selected tools.

**Preferred method**: Install via official script in `postCreateCommand` (`curl -fsSL https://claude.ai/install.sh | bash`).
Registry features (e.g., `ghcr.io/devcontainers-extra/features/claude-code:1`) are **NOT recommended** — they install outdated versions with broken OAuth.
For other AI CLIs, use devcontainer registry features where available (see [references/features-catalog.md](references/features-catalog.md)).

### Claude Code

| Aspect | Details |
|---|---|
| **Install (preferred)** | `postCreateCommand`: `curl -fsSL https://claude.ai/install.sh \| bash` — always installs latest version with working OAuth |
| **Install (alternative)** | `postCreateCommand`: `npm install -g @anthropic-ai/claude-code@latest` |
| **Install (NOT recommended)** | Registry features (`ghcr.io/devcontainers-extra/features/claude-code:1`, `ghcr.io/stu-bell/devcontainer-features/claude-code:0`) — install outdated versions with broken OAuth callback |
| **Config dir** | `~/.claude/` (settings, skills, auth tokens in `.credentials.json`). `~/.claude.json` (metadata, caches — auto-recreated, no tokens) |
| **Auth tokens** | Stored in `~/.claude/.credentials.json` inside the config dir. On macOS host: Keychain service `Claude Code-credentials`. See [references/auth-forwarding.md](references/auth-forwarding.md) |
| **Config volume** | `source=claude-config-${devcontainerId},target=/home/<user>/.claude,type=volume` |
| **Auth forwarding** | Host Keychain → staging file → container volume. See [references/auth-forwarding.md](references/auth-forwarding.md) |
| **Global skills mount** | `source=${localEnv:HOME}/.claude,target=/home/<user>/.claude-host,type=bind,readonly` |
| **Skills sync** | `rm -rf ~/.claude/skills ~/.claude/commands && cp -rL ~/.claude-host/skills ~/.claude/skills 2>/dev/null \|\| true && cp -rL ~/.claude-host/commands ~/.claude/commands 2>/dev/null \|\| true` |
| **Env vars** | `ANTHROPIC_API_KEY` — only if user explicitly provides API key; empty value breaks OAuth. Do NOT set `CLAUDE_CONFIG_DIR` (breaks volume auth strategy). `DISABLE_AUTOUPDATER=1` (optional, pin version) |
| **Extension** | `anthropic.claude-code` |

### OpenCode

| Aspect | Details |
|---|---|
| **Install (feature, preferred)** | `ghcr.io/jsburckhardt/devcontainer-features/opencode:1` |
| **Install (manual fallback)** | `postCreateCommand`: `curl -fsSL https://opencode.ai/install \| bash` |
| **Config dir** | `~/.config/opencode/` (settings, skills, commands, plugins) |
| **Config volume** | `source=opencode-config-${devcontainerId},target=/home/<user>/.config/opencode,type=volume` |
| **Global skills mount** | `source=${localEnv:HOME}/.config/opencode,target=/home/<user>/.config/opencode-host,type=bind,readonly` |
| **Skills sync** | `rm -rf ~/.config/opencode/skills && cp -rL ~/.config/opencode-host/skills ~/.config/opencode/skills 2>/dev/null \|\| true` |
| **Env vars** | `ANTHROPIC_API_KEY` (if using Anthropic provider) |
| **Extension** | None (standalone TUI/CLI, runs in terminal) |

### Cursor CLI

| Aspect | Details |
|---|---|
| **Install (feature)** | `ghcr.io/stu-bell/devcontainer-features/cursor-cli:0` |
| **Extension** | N/A (Cursor is the IDE host itself) |

### flowai

| Aspect | Details |
|---|---|
| **Install** | `postCreateCommand`: `deno install -g -A -f jsr:@korchasa/flowai` |
| **Config dir** | None (reads `.flowai.yaml` from the project workspace) |
| **Config volume** | None |
| **Global skills mount** | None |
| **Env vars** | None |
| **Extension** | None (CLI-only) |
| **Note** | Requires Deno. For non-Deno stacks, add `ghcr.io/devcontainers-extra/features/deno:latest` to features. |

### Global Skills Mount Rules

- Mount to a **separate path** (`*-host`) to avoid overwriting container-local config
- Use `readonly` — container should never write back to host config
- Sync `skills/` and `commands/` via `postStartCommand` (runs on every start, picks up host updates on restart). Use `cp -rL` to dereference symlinks — host skills may be symlinks with host-relative paths unresolvable inside the container
- Bind mounts do **NOT** work in GitHub Codespaces — for Codespaces, bake skills into the image or clone from a git repo in `postCreateCommand`

### Environment Variables (remoteEnv)

```jsonc
{
  // GitHub (always) — required for gh CLI auth + git credential helper (setup-container.sh)
  "GITHUB_TOKEN": "${localEnv:GITHUB_TOKEN}"
  // ANTHROPIC_API_KEY — add ONLY if user explicitly provides an API key.
  // WARNING: An empty value (unset on host) breaks OAuth by triggering API-key auth mode.
  // WARNING: Do NOT set CLAUDE_CONFIG_DIR — it breaks the volume auth strategy.
  // See references/auth-forwarding.md § Critical Warnings.
}
```

### Secrets (Codespaces metadata)

Add only for selected AI CLIs:
```jsonc
{
  // Add ANTHROPIC_API_KEY ONLY if user chose API-key auth (not OAuth)
  "GITHUB_TOKEN": {
    "description": "GitHub PAT for gh CLI"
  }
}
```

---

## Lifecycle Hooks Reference

| Hook | When | Use For |
|---|---|---|
| `initializeCommand` | On host, before container creation | Auth forwarding: extract host Keychain tokens to staging file (macOS only) |
| `postCreateCommand` | Once after container creation | Dependency install, CLI install, auth token copy from staging to volume |
| `postStartCommand` | Every container start | `git safe.directory`, global skills sync |
| `postAttachCommand` | Every IDE attach | Shell customization |

All hooks accept string, array, or object (parallel execution) format:
```jsonc
// Object form for parallel execution
"postCreateCommand": {
  "deps": "npm install",
  "cli": "curl -fsSL https://claude.ai/install.sh | bash"
}
```
