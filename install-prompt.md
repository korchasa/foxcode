# FoxCode — Setup Prompt for Claude Code

One-liner for Claude Code session:

```
Fetch https://raw.githubusercontent.com/korchasa/foxcode/main/install-prompt.md and follow the instructions.
```

---

## Instructions for Claude Code

Set up **FoxCode** — Firefox browser UI for Claude Code sessions.

### Step 1: Check prerequisites

1. `node --version` — must be v18+
2. Firefox installed: macOS → `/Applications/Firefox.app`, Linux → `which firefox`

If any check fails, tell the user what to install and stop.

### Step 2: Configure .mcp.json

Create or update `.mcp.json` in CWD (merge into existing `mcpServers`, don't overwrite):

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

### Step 3: Configure permissions

Add to `allowedTools` in `.claude/settings.local.json` (CWD) or `~/.claude/settings.json`:

```
"mcp__foxcode__reply"
"mcp__foxcode__edit_message"
"mcp__foxcode__evalInBrowser"
```

### Step 4: Tell user

```
Setup complete! Two manual steps:

1. Install extension: download foxcode-extension.xpi from
   https://github.com/korchasa/foxcode/releases
   Then: Firefox → about:debugging#/runtime/this-firefox → Load Temporary Add-on → select .xpi

2. Restart Claude Code in this directory: claude
```
