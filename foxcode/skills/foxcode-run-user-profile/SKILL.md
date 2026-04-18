---
name: foxcode-run-user-profile
description: >
  Launch FoxCode in User Profile mode. Guides user to load extension via about:debugging, opens connection page, verifies connectivity.
---

# FoxCode Run — User Profile

Load extension into user's Firefox, connect, verify. Communicate in user's language. Be concise — minimal output, no explanations unless something fails.

**Source of truth**: port and password come only from the MCP `status` response. Never read `~/.foxcode/port` or `~/.foxcode/password` directly — the file on disk may belong to a different server.

## 1. Initial status

Call `status`.
- Fails -> tell user "MCP server not running", stop.
- `connectedClients > 0` -> say "Ready." and stop.
- Otherwise remember `{port, password}` from the response as `PORT0`, `PASSWORD0`.

## 2. Resolve extension directory

```bash
python3 "${CLAUDE_SKILL_DIR}/../foxcode-run-project-profile/scripts/resolve_env.py" --format=json
```

Returns JSON: `{"skillDir", "firefox", "extensionDir"}`. Use `extensionDir` in step 3. If fails -> report stderr, stop.

(Note: this script no longer returns `port`/`password` — those come from `status` in step 1.)

## 3. Guide loading

Tell user (single message, substituting values from steps 1 and 2):

> 1. Load extension: `about:debugging` -> This Firefox -> Load Temporary Add-on -> `{extensionDir}/manifest.json`
> 2. Open in the same Firefox: `http://localhost:{PORT0}#{PORT0}:{PASSWORD0}`
>
> Tell me when done.

**Wait for user response.**

## 4. Verify connection

Poll `status` every 3s, max 10 attempts (30s).

- `connectedClients > 0` -> "Ready."
- All retries exhausted -> call `status` one final time and compare with step 1:
  - `port` or `password` differ from `PORT0`/`PASSWORD0` -> "MCP server restarted (port/password rotated). Re-run skill."
  - Unchanged -> "No connection. Check extension loaded and the URL opened in the same Firefox. Re-run skill."
