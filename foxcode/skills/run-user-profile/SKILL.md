---
name: run-user-profile
description: >
  Launch FoxCode in User Profile mode. Self-contained: checks prerequisites, locates extension,
  guides user to load it manually via about:debugging into their own Firefox, verifies connectivity.
  Caches resolved paths in .foxcode/config.json for fast re-runs.
disable-model-invocation: true
---

# FoxCode Run — User Profile

Self-contained launch: prerequisites → locate extension → guide manual loading → verify. Caches resolved paths in `.foxcode/config.json`.

**IMPORTANT:** Detect the user's language from conversation context and communicate in that language throughout.

## Step 1: Check server status

Call the `status` MCP tool.

If the tool call fails:
> FoxCode MCP server is not running. Make sure `.mcp.json` is configured and Claude Code loaded the foxcode MCP server. Restart Claude Code if needed.

Note the `port` and `connectedClients` from the response.

## Step 2: Check browser connection

If `connectedClients > 0`, call the `ping` tool. If both `forward` and `reverse` are `true`:
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
>
> The extension will auto-discover the MCP server by scanning ports 8787–8886.
>
> **Note:** Temporary add-ons are removed when Firefox closes. You'll need to re-load each time.

## Step 5: Verify connectivity

After the user confirms the sidebar is open, call the `ping` tool.

If both `forward` and `reverse` are `true`:
> Bidirectional connectivity confirmed. Ready to go.

If `forward` is `false`:
> No browser extension connected. Make sure the sidebar is open: **View > Sidebar > FoxCode**. Then try again.

If `forward` is `true` but `reverse` is `false`:
> Forward path works but browser did not reply. Try reloading the extension in `about:debugging`.
