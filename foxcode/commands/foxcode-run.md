# FoxCode Run

Unified command to launch Firefox with FoxCode and verify connectivity. Combines status check, browser launch, and ping into a single flow.

**IMPORTANT:** Detect the user's language from conversation context and communicate in that language throughout.

---

## Step 1: Check server status

Call the `status` MCP tool. It always works and does not require a browser.

If the tool call fails (MCP server not running):
> FoxCode MCP server is not running. Make sure `.mcp.json` is configured and Claude Code loaded the foxcode MCP server. Restart Claude Code if needed.

If it succeeds, note the `port` and `connectedClients` from the response.

---

## Step 2: Check browser connection

If `connectedClients > 0`:
> FoxCode is already connected (port {port}, {connectedClients} client(s)). Verifying bidirectional connectivity...

Call the `ping` tool. If both `forward` and `reverse` are `true`:
> Everything is working. Ready to go.

Stop here - no need to launch Firefox.

If `forward` is `false` or `reverse` is `false`, continue to Step 3.

---

## Step 3: Launch Firefox

If `connectedClients === 0` or ping failed:

Find the `extension/` directory. Check in order, use the first match:
1. `./extension/` in current working directory
2. Marketplace clone: read `~/.claude/plugins/known_marketplaces.json`, find entry where `source.repo` equals `korchasa/foxcode`, use its `installLocation` + `/extension/`

If not found:
> Extension source not found. Install the plugin first: `/plugin install korchasa/foxcode`

Check that Firefox is installed:
- **macOS**: check `/Applications/Firefox.app` exists
- **Linux**: run `which firefox`

If not found:
> Firefox is required. Install from https://www.mozilla.org/firefox/

Launch Firefox (use `$PORT` from Step 1 status response):
```bash
mkdir -p .foxcode/firefox-profile
npx web-ext run \
  --source-dir "$EXT_DIR" \
  --firefox-profile .foxcode/firefox-profile \
  --keep-profile-changes \
  --start-url "about:blank#foxcode-port=$PORT" \
  --firefox="$(which firefox || echo '/Applications/Firefox.app/Contents/MacOS/firefox')"
```

Tell the user:
> Firefox launched with FoxCode on port {port}. Open sidebar: **View > Sidebar > FoxCode**.

---

## Step 4: Verify connectivity

After the user confirms the sidebar is open, call the `ping` tool.

If both `forward` and `reverse` are `true`:
> Bidirectional connectivity confirmed. Ready to go.

If `forward` is `false`:
> No browser extension connected. Make sure the sidebar is open: **View > Sidebar > FoxCode**. Then try again.

If `forward` is `true` but `reverse` is `false`:
> Forward path works but browser did not reply. Try reloading the extension.
