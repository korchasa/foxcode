---
name: foxcode-run-user-profile
description: >
  Launch FoxCode in User Profile mode. Guides user to load extension via about:debugging, opens connection page, verifies connectivity.
---

# FoxCode Run — User Profile

Load extension into user's Firefox, connect, verify. Communicate in user's language. Be concise — minimal output, no explanations unless something fails.

## 1. Check if already connected

Call `status`. If fails → tell user MCP server not running, stop.
If `connectedClients > 0` → say "Ready." and stop.

## 2. Resolve environment

Read `.foxcode/config.json`. If cached paths exist and files are valid → skip resolution.

Otherwise resolve (in parallel):
- Firefox binary: macOS `/Applications/Firefox.app/Contents/MacOS/firefox`, Linux `which firefox`
- Extension dir: `./extension/` or marketplace clone (`~/.claude/plugins/known_marketplaces.json` → `source.repo` = `korchasa/foxcode` → `installLocation` + `/extension/`)

If anything missing → report, stop. Save resolved paths to `.foxcode/config.json`.

## 3. Guide loading

Tell user (single message):
> Load extension: Firefox → `about:debugging` → This Firefox → Load Temporary Add-on → select `$EXT_DIR/manifest.json`. Then open sidebar: View > Sidebar > FoxCode. Tell me when done.

**Wait for user response.**

## 4. Connect and verify

Open connection URL: `"$FIREFOX" "http://localhost:${PORT}#${PORT}:${PASSWORD}" &>/dev/null &`
If fails → give user the URL to open manually.

Poll `status` every 3s, max 10 attempts (30s). When `connectedClients > 0` → "Ready."
- All retries exhausted → "No connection. Check extension loaded + sidebar open. Re-run skill."
