# FoxCode — Setup Prompt for Claude Code

Set up **FoxCode** — Firefox browser UI for Claude Code sessions.

### Step 0: Explain to user (in their language)

Before doing anything, tell the user what you are about to do. Use the user's language (detect from conversation context). Briefly explain:

1. You will check that Node.js and Firefox are installed
2. You will add the FoxCode channel plugin to `.mcp.json` in the current project
3. You will add tool permissions to Claude Code settings
4. The user will need to manually install the Firefox extension and restart Claude Code

Ask the user to confirm before proceeding.

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

2. Restart Claude Code in this directory: claude --dangerously-load-development-channels server:foxcode
```
