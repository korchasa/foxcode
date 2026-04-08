# Claude Code Auth in Devcontainers

## Auth Architecture

Claude Code uses **two separate files** for auth-related data:

| File | Location | Contains | Required for auth? |
|---|---|---|---|
| `~/.claude/.credentials.json` | Inside `~/.claude/` dir | OAuth tokens (accessToken, refreshToken, expiresAt, scopes) | **Yes** — sole source of auth |
| `~/.claude.json` | Home dir root | Account metadata (email, org, display name), feature flags, caches | No — auto-recreated by CLI |

### Platform-Specific Token Storage

| Platform | Primary storage | Fallback |
|---|---|---|
| **macOS** (host) | Keychain service `Claude Code-credentials` | `~/.claude/.credentials.json` (plaintext) |
| **Linux** (container) | `~/.claude/.credentials.json` (plaintext) | None |

On macOS, `~/.claude/.credentials.json` typically does **not exist** — tokens live in Keychain only. In containers (Linux), plaintext file is the only option.

### Keychain Service Names (macOS)

- `Claude Code-credentials` — OAuth tokens (primary)
- `Claude Safe Storage` — encryption key for local data
- `AIR Claude Credentials` — additional credentials

## Auth in Devcontainer Lifecycle

### How Auth Gets Established

1. VS Code extension (`anthropic.claude-code`) performs OAuth flow via browser
2. Tokens saved to `~/.claude/.credentials.json` inside container
3. With named volume on `~/.claude/`, tokens persist across restarts/rebuilds

### Lifecycle Behavior Matrix

| Scenario | Volume survives? | Auth persists? | Action needed |
|---|---|---|---|
| Container restart | Yes | Yes | None |
| Container rebuild (same workspace) | Yes (same `devcontainerId`) | Yes | None |
| Rebuild Without Cache (same workspace) | Depends on IDE behavior | Usually yes | Verify |
| Different workspace folder | No (new `devcontainerId`) | No | Re-auth or forward from host |
| Volume manually deleted | No | No | Re-auth or forward from host |

`devcontainerId` is derived from workspace path. Same path = same volume name = auth persists.

## Auth Forwarding from Host (macOS → Container)

When auth is lost (new volume, new workspace), it can be restored automatically by forwarding tokens from the macOS Keychain.

### Mechanism

1. **Host-side**: `initializeCommand` extracts tokens from Keychain to a temp file
2. **Mount**: Bind-mount temp file into container (read-only)
3. **Container-side**: `postCreateCommand` copies tokens into the volume

### Implementation

**devcontainer.json mounts** (add to existing mounts):
```jsonc
// Host auth staging (read-only, created by initializeCommand)
"source=${localEnv:HOME}/.claude-auth-staging.json,target=/home/{{remote_user}}/.claude-auth-staging.json,type=bind,readonly"
```

**initializeCommand** (runs on host before container creation):
```jsonc
"initializeCommand": "security find-generic-password -s 'Claude Code-credentials' -w > ~/.claude-auth-staging.json 2>/dev/null || echo '{}' > ~/.claude-auth-staging.json"
```

**postCreateCommand** (add to existing):
```jsonc
"claude-auth": ".devcontainer/setup-container.sh"
```

The `setup-container.sh` script handles both Claude auth and gh CLI auth. See [devcontainer-template.md](devcontainer-template.md) § Auth forwarding via setup-container.sh for the full script.

**Why a script instead of inline?** The previous inline pattern (`[ ! -f ... ] && ... || true`) had two problems:
- `|| true` masked ALL errors — impossible to diagnose failures
- `[ ! -f ... ]` guard skipped copy when a corrupt/empty `.credentials.json` existed from a failed OAuth attempt

### How It Works

```
Host (macOS)                          Container (Linux)
Keychain ──initializeCommand──→  ~/.claude-auth-staging.json (temp file)
                                   │
                                   ├─ bind,readonly mount ──→ ~/.claude-auth-staging.json
                                   │
                                   └─ postCreateCommand runs setup-container.sh:
                                      ~/.claude-auth-staging.json → ~/.claude/.credentials.json
                                      (always copies if staging file is non-empty)
```

### Behavior

- **First create (empty volume)**: Tokens copied from host Keychain → auth works immediately
- **Rebuild (volume has tokens)**: Tokens overwritten from staging → always fresh from host Keychain
- **Host re-auth**: Tokens auto-updated on next rebuild (initializeCommand re-extracts from Keychain)
- **Non-macOS host**: `security` command fails silently → empty staging file → script logs message and exits cleanly → user authenticates via `claude login`
- **Multiple containers**: Each has own volume, own copy of tokens → no conflicts

## Critical Warnings

### DO NOT set `ANTHROPIC_API_KEY` to empty string in `remoteEnv`

`${localEnv:ANTHROPIC_API_KEY}` resolves to an empty string when the variable is not set on the host. Claude Code interprets an empty `ANTHROPIC_API_KEY` as an explicit API-key auth attempt — it skips OAuth entirely and fails with an auth error. Only include `ANTHROPIC_API_KEY` in `remoteEnv` if the user explicitly provides an API key value. When using OAuth (auth forwarding from macOS Keychain), do NOT include this variable at all.

### DO NOT set `CLAUDE_CONFIG_DIR`

`CLAUDE_CONFIG_DIR` redirects where Claude looks for `.credentials.json`. Setting it breaks the default `~/.claude/` volume mount strategy. Auth tokens would be searched in the overridden path, not in the volume.

### DO NOT bind-mount `~/.claude.json` from host

- Host `~/.claude.json` does NOT contain auth tokens (on macOS, they're in Keychain)
- Claude CLI writes to `~/.claude.json` constantly — read-only mount causes errors
- Read-write mount causes race conditions between host and containers
- The file is auto-recreated by CLI — losing it is harmless

### Token Refresh

- Tokens have ~6h expiry, CLI auto-refreshes via `refreshToken`
- Refresh writes updated tokens back to `.credentials.json`
- Volume must be writable for refresh to work (don't mount `.credentials.json` as read-only)

## Evidence

Verified experimentally (2026-03-15):

- **Internal tests**: `claude auth status` with/without each file, `CLAUDE_CONFIG_DIR` override, `HOME` override simulating rebuild
- **Source analysis**: Extension.js `iv()` function — Keychain primary on macOS, plaintext-only on Linux; `UO()` — `.credentials.json` path = `configDir/.credentials.json`
- **Host experiments**: All 6 lifecycle scenarios tested (restart, rebuild, volume delete, new workspace, Keychain extraction, auth forwarding)
- **Result**: All hypotheses confirmed. Auth forwarding from Keychain works.
