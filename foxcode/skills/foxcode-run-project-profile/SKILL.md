---
name: foxcode-run-project-profile
description: >
  Launch FoxCode in Project Profile mode. Self-contained: checks prerequisites, locates extension,
  launches isolated Firefox via web-ext with project-local profile, verifies connectivity.
  Caches resolved paths in .foxcode/config.json for fast re-runs.
disable-model-invocation: true
---

# FoxCode Run — Project Profile

Self-contained launch: prerequisites → locate extension → web-ext → verify. Caches resolved paths in `.foxcode/config.json`.

**IMPORTANT:** Detect the user's language from conversation context and communicate in that language throughout.

## Step 1: Check server status and channels

Call the `status` MCP tool.

If the tool call fails:
> FoxCode MCP server is not running. Make sure `.mcp.json` is configured and Claude Code loaded the foxcode MCP server. Restart Claude Code if needed.

Note the `port`, `password`, `connectedClients`, and `channelsDetected` from the response.

If `channelsDetected` is `false`:
> ⚠ Channels not detected. Browser → CC messaging will not work (sidebar messages won't reach Claude Code). CC → Browser tools (`reply`, `evalInBrowser`) will work normally.
>
> To enable bidirectional messaging, restart Claude Code with:
> `claude --dangerously-load-development-channels plugin:foxcode@korchasa`
>
> Or, if using an approved plugin on a team/enterprise plan, ensure `channelsEnabled: true` is set in managed settings.

Continue with setup regardless — the extension is still useful for `reply` and `evalInBrowser`.

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

**Node.js**: run `node --version`. Must be v18+.
> If missing: Node.js 18+ is required. Install from https://nodejs.org

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

## Step 4: Launch Firefox

```bash
mkdir -p .foxcode/firefox-profile
npx web-ext run \
  --source-dir "$EXT_DIR" \
  --firefox-profile .foxcode/firefox-profile \
  --keep-profile-changes \
  --start-url "about:blank#foxcode-port=$PORT&foxcode-password=$PASSWORD" \
  --firefox="$FIREFOX"
```

Tell the user:
> Firefox launched with FoxCode on port {port}. Open sidebar: **View > Sidebar > FoxCode**.

On first run, also explain:
> A separate Firefox window opened. Your existing Firefox stays untouched. The profile in `.foxcode/firefox-profile/` persists logins, cookies, and settings between sessions.

## Step 5: Wait for browser connection

Poll the `status` MCP tool every ~5 seconds, up to 12 attempts (60 seconds total).

On each poll, check `connectedClients`:
- If `connectedClients > 0` — proceed to verification below.
- If `connectedClients == 0` — wait ~5 seconds and retry.

If all 12 attempts exhausted with no connection:
> Browser did not connect within 60 seconds. Make sure the sidebar is open: **View > Sidebar > FoxCode** (or Cmd+B / Ctrl+B). Then run this skill again.

Stop here.

### Verify bidirectional connectivity

Once `connectedClients > 0`, call the `ping` tool.

If both `forward` and `reverse` are `true`:
> Bidirectional connectivity confirmed. Ready to go.

If `forward` is `false`:
> Browser connected but ping failed. Try reloading the extension.

If `forward` is `true` but `reverse` is `false`:
> Forward path works but browser did not reply. Try reloading the extension.
