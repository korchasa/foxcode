# FoxCode — Browser UI for Claude Code

Firefox sidebar extension for Claude Code sessions: real-time chat, page context injection, and browser automation — all from the browser.

## What it does

- **Chat in sidebar** — send/receive messages to your Claude Code session without switching to the terminal
- **Browser automation** — Claude Code controls the browser via `evalInBrowser`: click, fill forms, navigate, take screenshots, read DOM (~30 API helpers)

### Architecture

```
Firefox Sidebar ←→ WebSocket ←→ MCP Channel Plugin ←→ stdio ←→ Claude Code
(extension)        (localhost)     (Node.js)              (terminal)
```

The MCP server binds to a port in range 8787–8886 (first available, randomized start). The extension scans the full range to discover running servers.

## Getting Started

Install plugin:
```bash
/plugin marketplace add korchasa/foxcode
/plugin install foxcode@korchasa
```

Run the installation command:
```bash
/foxcode:foxcode-install
```

The install command checks prerequisites, downloads the extension, and guides you through Firefox setup interactively.

## How it works

- **Channel Plugin** (`foxcode/channel/`) — MCP server bridging Claude Code ↔ extension via WebSocket
- **Sidebar UI** — chat interface rendering messages, tool calls/results, with markdown support
- **Background script** — WebSocket connection, message routing, code execution engine
- **Content script** — DOM access for `api.eval()` in page main world

### Tools available to Claude Code

- `reply(text)` — send a message to the browser sidebar
- `evalInBrowser(code)` — execute JS with browser automation API (click, fill, navigate, snapshot, screenshot, cookies, tabs, etc.)

## Troubleshooting

### Extension shows "No servers found"

1. **Check MCP server is running.** In Claude Code, run `/mcp` — foxcode should appear with status `✔ connected`.
2. **Check port availability.** The server binds to a port in 8787–8886. Verify it's listening:
   ```bash
   lsof -i :8787-8886 | grep node
   ```
3. **Reload the extension.** After updating FoxCode, reload in `about:debugging` → This Firefox → FoxCode → Reload.

### MCP server fails to start (status: ✘ failed)

1. **Port conflict.** If another process occupies the entire range, the server can't bind. Check:
   ```bash
   lsof -i :8787-8886
   ```
   Kill stale foxcode processes if needed: `kill <PID>`.
2. **Reset saved port.** The server remembers its last port in `~/.foxcode/port`. Remove it to pick a new random port:
   ```bash
   rm ~/.foxcode/port
   ```
3. **Force a specific port.** Set `FOXCODE_PORT` env var in `.mcp.json`:
   ```json
   {"mcpServers": {"foxcode": {"command": "...", "env": {"FOXCODE_PORT": "8800"}}}}
   ```
4. **Check dependencies.** Ensure channel deps are installed:
   ```bash
   cd foxcode/channel && npm install
   ```

### Extension connected but wrong project

When multiple Claude Code sessions use FoxCode simultaneously, the extension shows a server indicator in the sidebar header. Click it to open the server picker and switch to the correct session. Use the ↻ button to rescan for servers.

### Channel capability not loaded

If MCP tools appear in `/mcp` but Claude doesn't receive browser messages, ensure the channel flag is set:
```bash
claude --dangerously-load-development-channels plugin:foxcode@korchasa
```
For dev mode with `.mcp.json`:
```bash
claude --mcp-config .mcp.json --dangerously-load-development-channels server:foxcode
```
