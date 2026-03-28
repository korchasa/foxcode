# FoxCode — Browser UI for Claude Code

Firefox sidebar extension for Claude Code sessions: real-time chat, page context injection, and browser automation — all from the browser.

## What it does

- **Chat in sidebar** — send/receive messages to your Claude Code session without switching to the terminal
- **Browser automation** — Claude Code controls the browser via `evalInBrowser`: click, fill forms, navigate, take screenshots, read DOM (~30 API helpers)

### Architecture

```
Firefox Sidebar ←→ WebSocket ←→ MCP Channel Plugin ←→ stdio ←→ Claude Code
(extension)        (localhost:8787)  (Node.js / npx)              (terminal)
```

## Getting Started

```bash
/plugin marketplace add korchasa/foxcode
/plugin install foxcode@korchasa
/foxcode:foxcode-install
```

The install command checks prerequisites, downloads the extension, and guides you through Firefox setup interactively.

## How it works

- **Channel Plugin** (`foxcode-channel` on npm) — MCP server bridging Claude Code ↔ extension via WebSocket
- **Sidebar UI** — chat interface rendering messages, tool calls/results, with markdown support
- **Background script** — WebSocket connection, message routing, code execution engine
- **Content script** — DOM access for `api.eval()` in page main world

### Tools available to Claude Code

- `reply(text)` — send a message to the browser sidebar
- `edit_message(message_id, text)` — edit a previously sent message
- `evalInBrowser(code)` — execute JS with browser automation API (click, fill, navigate, snapshot, screenshot, cookies, tabs, etc.)
