---
name: foxcode-run-user-profile
description: >
  Launch FoxCode in User Profile mode. Self-contained: checks prerequisites, locates extension,
  guides user to load it manually via about:debugging into their own Firefox, verifies connectivity.
  Caches resolved paths in .foxcode/config.json for fast re-runs.
---

# FoxCode Run — User Profile

Self-contained launch: prerequisites → locate extension → guide manual loading → verify. Caches resolved paths in `.foxcode/config.json`.

**IMPORTANT:** Detect the user's language from conversation context and communicate in that language throughout.

## Step 1: Check server status

Call the `status` MCP tool.

If the tool call fails:
> FoxCode MCP server is not running. Make sure `.mcp.json` is configured and Claude Code loaded the foxcode MCP server. Restart Claude Code if needed.

Note the `port`, `password`, and `connectedClients` from the response.

## Step 2: Check browser connection

If `connectedClients > 0`, call the `ping` tool. If `connected` is `true`:
> Everything is working. Ready to go.

Stop here. Otherwise continue to Step 3.

## Step 3: Resolve environment

Read `.foxcode/config.json` if it exists. It caches:
```json
{
  "extensionDir": "/path/to/extension/",
  "firefoxBinary": "/path/to/firefox"
}
```

### If cache exists and paths are valid (files exist) — skip to Step 4.

### If cache is missing or stale — resolve from scratch:

**Firefox binary**: find Firefox:
- **macOS**: `/Applications/Firefox.app/Contents/MacOS/firefox`
- **Linux**: `which firefox`

> If not found: Firefox is required. Install from https://www.mozilla.org/firefox/

**Extension source**: find `extension/` directory, first match:
1. `./extension/` in current working directory
2. Marketplace clone: read `~/.claude/plugins/known_marketplaces.json`, find `source.repo` = `korchasa/foxcode`, use `installLocation` + `/extension/`

> If not found: Extension source not found. Install the plugin: `/plugin install korchasa/foxcode`

**Save cache**:
```bash
mkdir -p .foxcode
cat > .foxcode/config.json << 'EOF'
{"extensionDir": "$EXT_DIR", "firefoxBinary": "$FIREFOX"}
EOF
```

Suggest adding `.foxcode/` to `.gitignore` if not already there.

## Step 4: Guide manual loading

Tell the user:

> Load extension into Firefox:
>
> 1. Open Firefox
> 2. Navigate to `about:debugging` → This Firefox → Load Temporary Add-on
> 3. Select `manifest.json` from: `$EXT_DIR`
> 4. Open the sidebar: **View > Sidebar > FoxCode** (or Ctrl+B / Cmd+B)
> 5. Open this URL in Firefox to connect: http://localhost:$PORT#$PORT:$PASSWORD
>
> **Note:** Temporary add-ons are removed when Firefox closes. You'll need to re-load each time.

## Step 5: Wait for user and verify

Tell the user:
> Let me know when you've loaded the extension and opened the URL. I'll verify the connection.

**Stop here and wait for user response.**

When user confirms, call the `status` MCP tool. Check `connectedClients`:

- If `connectedClients > 0` — call the `ping` tool:
  - If `connected` is `true`: > Connectivity confirmed. Ready to go.
  - If `connected` is `false`: > Browser connected but ping failed. Try reloading the extension in `about:debugging`.
- If `connectedClients == 0`:
  > No connection detected. Make sure:
  > 1. Extension is loaded in `about:debugging`
  > 2. Sidebar is open: **View > Sidebar > FoxCode** (or Cmd+B / Ctrl+B)
  > 3. You opened: http://localhost:$PORT#$PORT:$PASSWORD
  >
  > Let me know when ready — I'll check again.
