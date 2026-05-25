# FoxCode: AI Coding Agent -> Firefox Bridge

> **⚠️ Active Development** - This project is under heavy development. APIs, configuration, and behavior may change without notice. Expect breaking changes between versions.

Firefox WebExtension giving Claude Code and Codex browser automation in your real browser — with your sessions, cookies, and extensions (OpenCode support coming once the npm package ships). The agent scripts multi-step scenarios in a single call instead of round-tripping per action.

FoxCode is a two-part system: an **MCP server** (Node.js channel launched by your agent) and a **Firefox WebExtension** (popup eval console + browser automation), connected via WebSocket on localhost.

## Usage Patterns

- **Test in the browser** — verify fixes, check form flows, inspect rendered output — with access to your project's code
- **Automate browser operations** — fill forms, click through flows, extract data, manage cookies/storage in one `evalInBrowser` call
- **Debug with browser context** — inspect DOM or take a snapshot alongside the source, no need to explain what's on screen

## Prerequisites

- Firefox (any recent version). On Linux, `firefox-esr` works too.
- Node.js ≥ 18 (the MCP channel runs on it; `node -v` to check).
- One of: Claude Code, Codex, or OpenCode CLI installed.

## Install in Claude Code

Native plugin install — fully supported. Installs the MCP channel, the Firefox WebExtension assets, and the launch skills.

```
/plugin marketplace add korchasa/foxcode
/plugin install foxcode@korchasa
```

Or run `/plugin` for an interactive picker: add the `korchasa/foxcode` marketplace, then install `foxcode`. Verify with `/mcp` — `foxcode` appears in the server list.

## Install in Codex

Native plugin install, then a one-time MCP-server config patch.

```sh
codex plugin marketplace add korchasa/foxcode
```

Then append to `~/.codex/config.toml`:

```toml
[mcp_servers.foxcode]
command = "sh"
args = [
  "-c",
  "set -e; export FOXCODE_PROJECT_DIR=\"$PWD\"; PLUGIN_DIR=$(ls -d \"$HOME/.codex/plugins/cache/korchasa/foxcode/\"*/channel 2>/dev/null | sort -V | tail -1); [ -n \"$PLUGIN_DIR\" ] || { echo 'foxcode plugin cache not found — run: codex plugin marketplace add korchasa/foxcode' >&2; exit 1; }; cd \"$PLUGIN_DIR\"; NPM_BIN=\"$(dirname \"$(command -v node)\")/npm\"; [ -x \"$NPM_BIN\" ] || NPM_BIN=\"$(command -v npm)\"; [ -x \"$NPM_BIN\" ] || { echo 'foxcode: npm not found alongside node or in PATH' >&2; exit 1; }; \"$NPM_BIN\" ci --omit=dev --silent; exec node server.mjs",
]
```

The shell command resolves the latest cached version via glob — no config change on plugin updates. Verify with `codex mcp get foxcode` and `codex mcp list`.

> **Why the manual block?** `codex plugin marketplace add` caches the plugin and installs its skills, but Codex does not substitute `${CLAUDE_PLUGIN_ROOT}` in `.mcp.json` args for MCP server processes, nor does it set the env var at MCP runtime (upstream Codex issue [#19372](https://github.com/openai/codex/issues/19372)). Until that lands, the MCP entry has to be declared in `~/.codex/config.toml`.

## Install in OpenCode

Native install is `opencode plugin @korchasa/foxcode-opencode`, which patches `~/.config/opencode/opencode.json`. The npm package is **not yet published** — watch the [releases page](https://github.com/korchasa/foxcode/releases) for the publication marker. No supported install path exists in the meantime.

## Launch

After installing in any IDE, run the launch skill to start Firefox with the extension. Two profiles:

- **Project profile** — isolated Firefox via `web-ext`, project-local profile in `.foxcode/firefox-profile/`. Auto-connects via URL hash. Re-launches preserve the profile.
- **User profile** — your own Firefox via `about:debugging`. Manual load of the extension; uses saved sessions for connection.

| IDE | Project profile | User profile |
| --- | --- | --- |
| Claude Code | `/foxcode:foxcode-run-project-profile` | `/foxcode:foxcode-run-user-profile` |
| Codex | `$foxcode-run-project-profile` | `$foxcode-run-user-profile` |
| OpenCode | tell the agent: *run skill `foxcode-run-project-profile`* | tell the agent: *run skill `foxcode-run-user-profile`* |

## First call

After the launch skill reports "Ready.", verify the bridge by asking the agent to run:

```
evalInBrowser({ code: 'await api.navigate("https://example.com/"); return await api.getTitle();' })
```

Expected result: `"Example Domain"`. If you see `"No browser extension connected"`, jump to [Troubleshooting](#troubleshooting).

## Features

- **Real browser, real context** — your Firefox with existing sessions, cookies, auth, extensions
- **Single-call scripting** — full JS scenario in one tool call, no round-trip per action
- **Rich async API** — ~36 helpers for DOM, navigation, tabs, cookies, screenshots, storage, console capture, dialog handling
- **Multi-session** — multiple agent sessions connect to one browser simultaneously, each on a unique port
- **One MCP server across IDEs** — Claude Code plugin, Codex plugin, and the planned OpenCode package all start the same MCP channel; extension auto-connects via URL hash

## Architecture

```mermaid
graph LR
  CC["Claude Code / OpenCode / Codex<br/>(terminal or IDE)"] -->|stdio| MCP["MCP Channel<br/>(Node.js)"]
  MCP -->|"WebSocket<br/>localhost:8787–8886"| EXT["Firefox Extension<br/>(popup + background)"]
  EXT -->|executeScript| TAB["Active Tab DOM"]
  EXT -->|eval via content script| PAGE["Page JS Context"]
```

The MCP server binds to a random port in range 8787–8886 and persists it in `~/.foxcode/port`. The extension supports multiple simultaneous connections (one per agent session) — auto-connects via URL hash params, or reconnects to saved sessions. No port scanning, no manual settings.

## Components

- **Channel** (`foxcode/channel/`) - MCP server (Node.js, ES modules) bridging agent -> extension via WebSocket. Installed or configured per supported agent, provides MCP tools
- **Firefox Extension** (`foxcode/extension/`) - Manifest V2 WebExtension bundled inside the plugin: popup eval console (browser_action), background script for WebSocket + code execution, content script for DOM access in page context
- **Run Skills** (`foxcode/skills/`) - launch skills for Project Profile and User Profile modes (see Launch)

### MCP tools provided to agents

- `evalInBrowser(code, timeout?)` - execute JS with browser automation API (click, fill, navigate, snapshot, screenshot, cookies, tabs, etc.)
- `status()` - server telemetry: port, password, projectDir, uptime, connectedClients, launchMode, client info

## Launch Flows

### Project Profile (`/foxcode:foxcode-run-project-profile`)

Isolated Firefox via `web-ext run`, project-local profile (`.foxcode/firefox-profile/`). Port passed via URL hash — instant connection.

```mermaid
sequenceDiagram
    participant U as User
    participant CC as Claude Code
    participant MCP as MCP Server
    participant WE as web-ext
    participant FF as Firefox (project profile)
    participant EXT as Extension

    U->>CC: Start session
    CC->>MCP: Launch (stdio)
    MCP->>MCP: Bind port (8787–8886)
    MCP->>MCP: Save port to ~/.foxcode/port

    U->>CC: /foxcode:foxcode-run-project-profile
    CC->>MCP: status tool → get port
    CC->>WE: npx web-ext run --start-url "http://localhost:PORT"
    WE->>FF: Launch with extension pre-loaded
    FF->>EXT: Load extension automatically

    EXT->>EXT: background.js: connect()
    EXT->>EXT: getPortFromTabs() → parse hash from connection page URL
    Note over EXT: Port found instantly from URL hash
    EXT->>MCP: WebSocket connect to PORT
    MCP-->>EXT: Connection established
    EXT-->>U: Sidebar ready, connected
```

### User Profile (`/foxcode:foxcode-run-user-profile`)

User's own Firefox via about:debugging. No port in URL — extension uses saved sessions.

```mermaid
sequenceDiagram
    participant U as User
    participant CC as Claude Code
    participant MCP as MCP Server
    participant FF as Firefox (user profile)
    participant EXT as Extension

    U->>CC: Start session
    CC->>MCP: Launch (stdio)
    MCP->>MCP: Bind port

    U->>CC: /foxcode:foxcode-run-user-profile
    CC->>MCP: status → get port
    CC-->>U: Instructions + port/password

    U->>FF: Open about:debugging
    U->>FF: Load Temporary Add-on → manifest.json
    FF->>EXT: Load extension

    EXT->>EXT: background.js: connect()
    EXT->>EXT: getParamsFromTabs() → no URL hash params

    alt Saved sessions exist
        EXT->>MCP: Connect to saved sessions
        MCP-->>EXT: Connected
    else No saved sessions
        EXT-->>U: "No active sessions" banner
    end

    MCP-->>EXT: pong (server info)
    EXT-->>U: Sidebar ready, shows session bar
```

### Key differences

- **Project Profile**: isolated Firefox, port known upfront (URL hash) → instant connect. Persistent project-local profile
- **User Profile**: user's own Firefox, no port hint → probe saved sessions. Temporary add-on, re-load after Firefox restart
- **Multi-session**: extension supports N simultaneous WebSocket connections. Popup shows eval messages from all sessions
- **Reconnect**: per-session exponential backoff (3s → 30s max, 10 attempts). Dead sessions auto-removed
- **Connection**: both skills verify connectivity via `status` tool (connectedClients > 0)

## Permissions (Claude Code)

Claude Code only — Codex and OpenCode have their own approval models that govern MCP tool calls independently.

By default, Claude Code asks for approval on every `evalInBrowser` call. To reduce friction, add permission rules to `.claude/settings.json` in your project:

```json
{
  "permissions": {
    "allow": [
      "mcp__foxcode__status"
    ]
  }
}
```

This auto-approves `status` (read-only, safe). `evalInBrowser` stays in ask mode — it executes arbitrary JS in your browser, so manual approval per call is recommended.

To also auto-approve `evalInBrowser` (use with caution):
```json
{
  "permissions": {
    "allow": [
      "mcp__foxcode__status",
      "mcp__foxcode__evalInBrowser"
    ]
  }
}
```

## Troubleshooting

### Popup shows "No active sessions"

- **No sessions** — MCP server not running or extension hasn't connected. List MCP servers in your IDE: Claude Code `/mcp`, Codex `codex mcp list`, OpenCode `opencode mcp list`.
- **Session shows "(reconnecting…)"** — Server was running but stopped. The agent process may have exited. After 10 failed reconnect attempts (exponential backoff 3s → 30s) the session is silently removed from the list.
- **To connect** — open the connection URL (`http://localhost:PORT#PORT:PASSWORD`) from the skill output, or re-run the launch skill.

### evalInBrowser returns "No browser extension connected"

- Extension not loaded — load via `about:debugging` or re-run the launch skill.
- Connection dropped — check popup for session status. Re-open the connection URL.
- Password mismatch — if `~/.foxcode/password` was regenerated (e.g. deleted and server restarted), the extension's saved session has a stale token. Fix: re-open the connection URL (`http://localhost:PORT#PORT:PASSWORD`) from `status` tool output, or delete `~/.foxcode/password` and restart both server and extension.

### Project profile launch reports "Firefox update is pending"

- Firefox has a staged applied update or a live updater process for the FoxCode connection URL. The launch skill stops before `web-ext` so the failure is explicit instead of timing out with `connectedClients: 0`.
- Fix: quit all Firefox instances, let the updater finish replacing Firefox.app, then re-run the launch skill.

### evalInBrowser timeout

Default timeout is 30s. If exceeded: `Browser tool request timed out after 30000ms`.

- Pass a higher timeout: `evalInBrowser({ code: "...", timeout: 60000 })`
- Break long operations into smaller `evalInBrowser` calls.

### MCP server fails to start

1. **Port conflict.** Server binds to a port in 8787–8886. Check: `lsof -i :8787-8886 | grep node`
2. **All ports occupied.** If all 100 ports are busy, server starts without WebSocket (stderr: `no free port in range`). Free ports or use `FOXCODE_PORT`.
3. **Reset saved port:** `rm ~/.foxcode/port`
4. **Force a specific port.** Set `FOXCODE_PORT` env var in `.mcp.json`:
   ```json
   {"mcpServers": {"foxcode": {"command": "...", "env": {"FOXCODE_PORT": "8800"}}}}
   ```
5. **Check dependencies:** `cd foxcode/channel && npm install`
