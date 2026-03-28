# Firefox Agent - Claude Code Channel Plugin

A Firefox extension for importing web page context into Claude Code via the [Claude Code Channels](https://code.claude.com/docs/en/channels-reference) protocol.

## The Problem

When working with Claude Code, you often need to provide context from a web page: documentation, a tracker error, a PR discussion, or an article. Currently, this requires manual copy-pasting.

## The Solution

A Channel plugin for Claude Code that receives content from the Firefox extension via WebSocket and pushes it as a `<channel>` event into the Claude Code session.

### Architecture

```
Firefox Extension ←- WebSocket -→ MCP Channel Plugin ←- stdio -→ Claude Code
(browser)            (localhost)     (Node.js)                      (terminal)
```

**Three components:**

1. **Firefox Extension** (WebExtension, Manifest v2) - extracts page content and connects to the MCP server via WebSocket on localhost.
2. **MCP Channel Plugin** (Node.js) - an MCP server that hosts the WebSocket, receives content from the extension, and pushes events to Claude Code. It provides `reply` and `react` tools for feedback.
3. **Claude Code** - runs with the `--channels` flag, receives events, and processes them with full access to the project.

### Data Flow

```
1. User clicks the button in the extension → "Send page to Claude"
2. Content script extracts page content (text, URL, title)
3. Extension sends data via WebSocket to localhost:PORT
4. MCP server wraps it in a <channel> event and pushes it to Claude Code
5. Claude Code processes the context within the current session
6. (Optional) Claude responds via the reply tool → WebSocket → extension
```

## Requirements

### Functional

- **Page Context Import**: extraction of text content, URL, and title of the current tab.
- **Selected Text Import**: sending only the selected fragment via the context menu.
- **Status Display**: connection indicator for the MCP server (WebSocket connected/disconnected).
- **Feedback**: displaying Claude Code responses in a sidebar or notification.

### Non-functional

- **Minimal Dependencies**: Node.js (already required for Claude Code), no Python or native host registry.
- **Simple Installation**: `npm install` + adding to `.mcp.json` + loading the extension.
- **Security**: WebSocket restricted to localhost, allowlist for sender IDs.
- **Content Size**: configurable limit (default 10KB, maximum 200KB).

### Technical Constraints

- Claude Code Channels is a research preview (v2.1.80+); the API may change.
- Requires login via claude.ai (API keys are not supported).
- Development plugins require the `--dangerously-load-development-channels` flag.
- WebSocket on localhost does not require CORS but needs permission in the manifest.

## Getting Started

### Quick setup (recommended)

1. Add to your project's `.mcp.json`:
   ```json
   {
     "mcpServers": {
       "foxcode": {
         "command": "npx",
         "args": ["-y", "foxcode-channel"]
       }
     }
   }
   ```
2. Download `foxcode-extension.xpi` from [Releases](https://github.com/korchasa/firefox-agent/releases)
3. In Firefox: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → select the `.xpi`
4. Run `claude` in your project directory

For automated setup with permissions, paste [install-prompt.md](install-prompt.md) into a Claude Code session.

### From source

```bash
# 1. Channel plugin
cd channel && npm install

# 2. Load extension in Firefox
# about:debugging → Load Temporary Add-on → extension/manifest.json

# 3. Run Claude Code (uses .mcp.json in repo root)
claude
```

## Reference

The `ref/Fire-Claude/` folder contains an existing extension with a similar goal, but based on Native Messaging + Python + subprocess `claude -p`. It is used as a reference for content extraction and UI, but the architecture has been replaced with Claude Code Channels.