---
name: foxcode-run-project-profile
description: >
  Launch FoxCode in Project Profile mode. Checks prerequisites, launches Firefox via web-ext, verifies connectivity.
---

# FoxCode Run — Project Profile

Launch isolated Firefox with FoxCode extension. Communicate in user's language. Be concise — minimal output, no explanations unless something fails.

**IMPORTANT**: Minimize tool calls. Each call costs ~3s of overhead. Combine bash commands. Use parallel calls where noted.

## 1. Check if already connected

Call `status`. If fails -> tell user MCP server not running, stop.
If `connectedClients > 0` -> call `ping`. If `connected: true` -> say "Ready." and stop.

## 2. Resolve environment and launch

### 2a. Read config + password (ONE bash call)

```bash
cat .foxcode/config.json 2>/dev/null; echo "---SEPARATOR---"; cat "$HOME/.foxcode/password" 2>/dev/null
```

If config.json exists with valid paths AND password is present -> go to 2c.

### 2b. Full resolution (only if no cached config)

Run ONE bash command to resolve everything:

```bash
node --version && \
{ test -x /Applications/Firefox.app/Contents/MacOS/firefox && echo "FIREFOX=/Applications/Firefox.app/Contents/MacOS/firefox" || \
  { FF=$(which firefox 2>/dev/null) && echo "FIREFOX=$FF"; } || \
  echo "FIREFOX_NOT_FOUND"; } && \
{ EXT="$HOME/.claude/plugins/marketplaces/korchasa/extension"; \
  test -f "$EXT/manifest.json" && echo "EXT_DIR=$EXT" || \
  { EXT="./extension"; test -f "$EXT/manifest.json" && echo "EXT_DIR=$EXT" || \
    echo "EXT_DIR_NOT_FOUND"; }; }
```

If anything missing -> report, stop.
MUST save resolved paths to `.foxcode/config.json`:
```json
{"firefox": "<FIREFOX>", "extensionDir": "<EXT_DIR>"}
```

### 2c. Launch Firefox (background bash)

Use PORT from step 1 `status` response and PASSWORD from step 2a.

```bash
mkdir -p .foxcode/firefox-profile && npx web-ext run \
  --source-dir "$EXT_DIR" --firefox-profile .foxcode/firefox-profile \
  --keep-profile-changes --start-url "http://localhost:${PORT}#${PORT}:${PASSWORD}" \
  --firefox="$FIREFOX"
```

Tell user: "Firefox launching on port {port}."

## 3. Verify connection

```bash
sleep 5
```

Then call `status`. If `connectedClients > 0` -> call `ping`.
- `connected: true` -> "Ready."
- Not connected -> wait 3s, retry `status` (max 3 retries).
- All retries exhausted -> "No connection. Open sidebar: View > Sidebar > FoxCode. Re-run skill."
