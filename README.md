# FoxCode — Browser UI for Claude Code

Firefox sidebar extension for Claude Code sessions: real-time chat, page context injection, and browser automation — all from the browser.

## What it does

- **Chat in sidebar** — send/receive messages to your Claude Code session without switching to the terminal
- **Browser automation** — Claude Code controls the browser via `evalInBrowser`: click, fill forms, navigate, take screenshots, read DOM (~30 API helpers)
- **Page context** — right-click selected text → "Send to Claude" injects it into the session
- **Fail-fast startup** — channel plugin exits immediately with actionable error if Claude Code lacks channel capability

### Architecture

```
Firefox Sidebar ←→ WebSocket ←→ MCP Channel Plugin ←→ stdio ←→ Claude Code
(extension)        (localhost:8787)  (Node.js / npx)              (terminal)
```

## Getting Started

Paste this into a Claude Code session (started with `--dangerously-load-development-channels server:foxcode`):

```
Fetch https://raw.githubusercontent.com/korchasa/foxcode/main/install-prompt.md and follow the instructions.
```

## How it works

- **Channel Plugin** (`foxcode-channel` on npm) — MCP server bridging Claude Code ↔ extension via WebSocket
- **Sidebar UI** — chat interface rendering messages, tool calls/results, with markdown support
- **Background script** — WebSocket connection, message routing, code execution engine
- **Content script** — DOM access for `api.eval()` in page main world

### Tools available to Claude Code

- `reply(text)` — send a message to the browser sidebar
- `edit_message(message_id, text)` — edit a previously sent message
- `evalInBrowser(code)` — execute JS with browser automation API (click, fill, navigate, snapshot, screenshot, cookies, tabs, etc.)
