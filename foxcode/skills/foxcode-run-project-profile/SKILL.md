---
name: foxcode-run-project-profile
description: >
  Launch FoxCode in Project Profile mode. Checks prerequisites, launches Firefox via web-ext, verifies connectivity.
---

# FoxCode Run — Project Profile

Launch isolated Firefox with FoxCode extension. Communicate in user's language. Be concise — minimal output, no explanations unless something fails.

## 1. Check if already connected

Call `status`. If fails → tell user MCP server not running, stop.
If `connectedClients > 0` → call `ping`. If `connected: true` → say "Ready." and stop.

## 2. Resolve environment (parallel where possible)

Read `.foxcode/config.json`. If cached paths exist and files are valid → skip resolution.

Otherwise resolve ALL of these (run checks in parallel):
- `node --version` (must be v18+)
- Firefox binary: macOS `/Applications/Firefox.app/Contents/MacOS/firefox`, Linux `which firefox`
- Extension dir: `./extension/` or marketplace clone (`~/.claude/plugins/known_marketplaces.json` → `source.repo` = `korchasa/foxcode` → `installLocation` + `/extension/`)

If anything missing → report what's missing, stop. Save resolved paths to `.foxcode/config.json`.

## 3. Launch Firefox and verify

Run in background:
```bash
mkdir -p .foxcode/firefox-profile && npx web-ext run \
  --source-dir "$EXT_DIR" --firefox-profile .foxcode/firefox-profile \
  --keep-profile-changes --start-url "http://localhost:${PORT}#${PORT}:${PASSWORD}" \
  --firefox="$FIREFOX"
```

Tell user: "Firefox launching on port {port}."

Poll `status` every 3s, max 10 attempts (30s). When `connectedClients > 0` → call `ping`.
- `connected: true` → "Ready."
- Timeout or ping fails → "No connection. Open sidebar: View > Sidebar > FoxCode. Re-run skill."
