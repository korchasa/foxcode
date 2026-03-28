# FoxCode Ping

Test bidirectional connectivity between Claude Code and the Firefox extension.

**IMPORTANT:** Detect the user's language from conversation context and communicate in that language throughout.

---

## Step 1: Call the ping tool

Call the `ping` MCP tool (no arguments).

It sends a test message to the browser extension via WebSocket; the extension automatically replies back.

The tool returns `{ forward: bool, reverse: bool }`:
- **forward** — CC → MCP → WebSocket → browser
- **reverse** — browser → WebSocket → MCP → CC

---

## Step 2: Report result

If both `true`: confirm full bidirectional connectivity.

If `forward` is `false`:
> No browser extension connected. Open Firefox sidebar: **View > Sidebar > FoxCode**.

If `forward` is `true` but `reverse` is `false`:
> Forward path works but browser did not reply. Try reloading the extension.
