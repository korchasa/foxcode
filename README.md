# FoxCode - Claude Code <-> Firefox Bridge

> **⚠️ Active Development** - This project is under heavy development. APIs, configuration, and behavior may change without notice. Expect breaking changes between versions.

Bidirectional bridge between Claude Code and Firefox. Chat with Claude Code from the browser sidebar, give it page context, and let it automate the browser - all without leaving Firefox.

FoxCode is a two-part system: a **Claude Code plugin** (MCP channel server on Node.js) and a **Firefox WebExtension** (sidebar UI + browser automation), connected via WebSocket on localhost.

## Usage Patterns

### Talk to Claude Code about what you see in the browser

Working on a project and found a bug on the page? Open the Firefox sidebar and describe it — Claude Code receives the tab URL, title, and your message in the context of the current project session. No copy-pasting URLs into the terminal.

### Let Claude Code test your project in the browser

Claude Code can click, fill forms, navigate, take screenshots, read DOM via `evalInBrowser` (~30 API helpers). Ask it to verify a fix, check a form flow, or inspect the rendered output — all while it has access to your project's code.

### Give Claude Code browser context for debugging

Claude Code sees the current page automatically. Useful when describing frontend issues: instead of explaining what's on screen, just point Claude Code at the page and let it inspect the DOM or take a snapshot alongside the project source.

## Getting Started

Install plugin:
```bash
/plugin marketplace add korchasa/foxcode
/plugin install foxcode@korchasa
```

Launch FoxCode with one of two modes:
```bash
/foxcode:foxcode-run-project-profile   # isolated Firefox with project-local profile
/foxcode:foxcode-run-user-profile      # load extension into your own Firefox
```

### Commands

- `/foxcode:foxcode-run-project-profile` — launch in isolated Firefox via web-ext with project-local profile (`.foxcode/firefox-profile/`). Self-contained: checks prerequisites, locates extension, caches paths in `.foxcode/config.json`.
- `/foxcode:foxcode-run-user-profile` — load extension into your own Firefox via about:debugging. Self-contained: checks prerequisites, locates extension, guides manual loading, caches paths in `.foxcode/config.json`.

## Features

- **Chat in sidebar** - send/receive messages to your Claude Code session
- **Page context** - Claude Code sees the current tab URL and title with every message
- **Browser automation** - click, fill forms, navigate, take screenshots, read DOM (~30 API helpers)
- **Connection diagnostics** - sidebar shows port, params source, error details, and retry timer when disconnected
- **Channel detection** - detects if Claude Code was launched with channel support; warns when sidebar→CC messaging won't work

## Architecture

```
┌─────────────┐    WebSocket     ┌───────────────────┐    stdio    ┌─────────────┐
│   Firefox    │ ←────────────->  │  MCP Channel      │ ←────────-> │ Claude Code  │
│  Extension   │   localhost:    │  Plugin (Node.js)  │            │   (terminal) │
│  (sidebar +  │   8787–8886    │  foxcode/channel/  │            │              │
│  background) │                │                    │            │              │
└─────────────┘                 └───────────────────┘            └─────────────┘
```

The MCP server binds to a random port in range 8787–8886 and persists it in `~/.foxcode/port`. The extension connects via URL hash params (project profile), saved port, or manual settings — no port scanning.

## Components

- **Channel Plugin** (`foxcode/channel/`) - MCP server (Node.js, ES modules) bridging Claude Code ↔ extension via WebSocket. Installed as a Claude Code plugin, provides MCP tools and the channel capability
- **Firefox Extension** (`extension/`) - Manifest V2 WebExtension: sidebar chat UI, background script for WebSocket + code execution, content script for DOM access in page context
- **Run Project Profile Skill** (`foxcode/skills/foxcode-run-project-profile/SKILL.md`) - self-contained: prerequisites, locate extension, launch isolated Firefox via web-ext, verify connectivity
- **Run User Profile Skill** (`foxcode/skills/foxcode-run-user-profile/SKILL.md`) - self-contained: prerequisites, locate extension, guide manual loading, verify connectivity

### MCP tools provided to Claude Code

- `reply(text)` - send a message to the browser sidebar
- `evalInBrowser(code)` - execute JS with browser automation API (click, fill, navigate, snapshot, screenshot, cookies, tabs, etc.)
- `status()` - server telemetry: port, uptime, clients, channelsDetected, launchMode, client info
- `ping()` - verify bidirectional connectivity (CC → browser → CC)

## Launch Flows

Two ways to load the extension into Firefox. Both are valid and must stay working.

### Project Profile (`/foxcode:foxcode-run-project-profile`)

Isolated Firefox instance launched via `web-ext run` with a project-local profile (`.foxcode/firefox-profile/`). Port is passed via URL hash — instant connection. First setup via `install`, subsequent launches via `run`.

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
    CC->>WE: npx web-ext run --start-url "about:blank#foxcode-port=PORT"
    WE->>FF: Launch with extension pre-loaded
    FF->>EXT: Load extension automatically

    EXT->>EXT: background.js: connect()
    EXT->>EXT: getPortFromTabs() → parse #foxcode-port from tab URL
    Note over EXT: Port found instantly from URL hash
    EXT->>MCP: WebSocket connect to PORT
    MCP-->>EXT: Connection established
    EXT-->>U: Sidebar ready, connected
```

### User Profile (`/foxcode:foxcode-run-user-profile`)

Extension loaded into user's own Firefox via about:debugging. No port in URL — extension uses saved port from previous session or manual settings form. Re-launch via `/foxcode:foxcode-run-user-profile`.

```mermaid
sequenceDiagram
    participant U as User
    participant CC as Claude Code
    participant MCP as MCP Server
    participant FF as Firefox (user profile)
    participant EXT as Extension

    U->>CC: Start session
    CC->>MCP: Launch (stdio)
    MCP->>MCP: Bind port, detect channels

    U->>CC: /foxcode:foxcode-run-user-profile
    CC->>MCP: status → get port, channelsDetected
    CC-->>U: Instructions + port/password

    U->>FF: Open about:debugging
    U->>FF: Load Temporary Add-on → manifest.json
    FF->>EXT: Load extension

    EXT->>EXT: background.js: connect()
    EXT->>EXT: getParamsFromTabs() → no URL hash params

    alt Saved port exists
        EXT->>MCP: Connect to saved port
        MCP-->>EXT: Connected
    else No saved port
        EXT-->>U: Show settings form (manual port/password)
        U->>EXT: Enter port + password
        EXT->>MCP: Connect
    end

    MCP-->>EXT: pong (channelsDetected, server info)
    EXT-->>U: Sidebar ready, shows server info
```

### Key differences

- **Project Profile**: isolated Firefox, port known upfront (URL hash) → instant connect. Persistent project-local profile
- **User Profile**: user's own Firefox, no port hint → probe saved port or manual settings form. Temporary add-on, re-load after Firefox restart
- **Reconnect**: both flows use saved params with exponential backoff (3s → 30s max)
- **Channel detection**: both skills check `channelsDetected` from `status` tool and warn if channels not enabled

## Troubleshooting

### Sidebar shows "No connection" with diagnostics

The sidebar displays diagnostic info: port, params source, error, and retry timer. Use this to identify the issue:

- **Error: "Cannot connect to ws://127.0.0.1:PORT"** — MCP server not running or wrong port. Check `/mcp` in Claude Code.
- **Error: "Connection refused or dropped"** — Server was running but stopped. CC may have exited.
- **Source: "URL hash params"** — Port came from launch URL (project profile mode). If wrong, re-run `/foxcode:foxcode-run-project-profile`.
- **Source: "saved from previous session"** — Using stale port. Click the connection indicator → enter correct port/password manually.

### Sidebar shows "Channels not enabled"

The MCP server detected that Claude Code was **not** launched with channel support. Sidebar input is disabled because messages can't reach CC.

**Fix:** Restart Claude Code with the channels flag:
```bash
claude --dangerously-load-development-channels plugin:foxcode@korchasa
```
For dev mode:
```bash
claude --mcp-config .mcp.json --dangerously-load-development-channels server:foxcode
```

Note: CC → Browser tools (`reply`, `evalInBrowser`) still work without channels. Only Browser → CC messaging requires channels.

### MCP server fails to start

1. **Port conflict.** Server binds to a port in 8787–8886. Check: `lsof -i :8787-8886 | grep node`
2. **Reset saved port:** `rm ~/.foxcode/port`
3. **Force a specific port.** Set `FOXCODE_PORT` env var in `.mcp.json`:
   ```json
   {"mcpServers": {"foxcode": {"command": "...", "env": {"FOXCODE_PORT": "8800"}}}}
   ```
4. **Check dependencies:** `cd foxcode/channel && npm install`
