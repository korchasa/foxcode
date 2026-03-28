# FoxCode — Setup Prompt for Claude Code

Paste everything below into a Claude Code session to set up FoxCode (Firefox browser UI for Claude Code).

---

## Instructions for Claude Code

You are setting up **FoxCode** — a Firefox extension that provides browser UI for Claude Code sessions. Follow these steps in order. Automate what you can; output clear manual instructions for what requires human action.

### Step 1: Check prerequisites

Run these checks. If any fail, tell the user what to install and stop.

1. **Node.js ≥18**: `node --version` — must be v18+
2. **Firefox**: On macOS check `/Applications/Firefox.app` exists or `which firefox`. On Linux: `which firefox` or `which firefox-esr`.
3. **Claude Code CLI**: `claude --version` — must be present (channel support is built-in)

### Step 2: Smoke test the channel server

```
npx foxcode-channel --help 2>/dev/null || echo "Package not yet published — install from source: see README"
```

### Step 3: Configure .mcp.json in the target project

The target project is the **current working directory** (where this Claude Code session runs).

Create or update `.mcp.json` in CWD:

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

Rules:
- If `.mcp.json` already exists, **merge** the `foxcode` entry into `mcpServers` — do NOT overwrite other servers.
- Validate that the resulting file is valid JSON.

### Step 4: Configure Claude Code permissions

Add the `foxcode` MCP server to allowed tools in Claude Code settings so the user isn't prompted for every tool call.

Check if `.claude/settings.local.json` exists in CWD. If yes, add permissions there. Otherwise use `~/.claude/settings.json`.

Add to the `allowedTools` array (create if missing):
```
"mcp__foxcode__reply"
"mcp__foxcode__edit_message"
"mcp__foxcode__evalInBrowser"
```

Merge, don't overwrite existing entries.

### Step 5: Output manual steps

Print this message to the user:

---

**Setup complete!** Two manual steps remain:

1. **Install the extension in Firefox:**
   - Download `foxcode-extension.xpi` from [Releases](https://github.com/korchasa/firefox-agent/releases)
   - Open Firefox → `about:debugging#/runtime/this-firefox`
   - Click **"Load Temporary Add-on..."** → select the downloaded `.xpi`
   - The "FoxCode" sidebar will appear in View → Sidebar

2. **Restart Claude Code** in this project directory to pick up the new `.mcp.json`:
   ```
   claude
   ```
   The FoxCode channel server will start automatically via npx.

**Verify:** Open the FoxCode sidebar in Firefox — status should show "Connected" once Claude Code is running.
