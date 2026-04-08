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

```bash
python3 "${CLAUDE_SKILL_DIR}/../foxcode-run-project-profile/scripts/resolve_env.py" --format=json
```

Returns JSON: `{"skillDir", "firefox", "extensionDir", "port", "password"}`. If fails → report error, stop.
Use JSON values in steps below.

## 3. Guide loading

Tell user (single message):
> 1. Load extension: `about:debugging` → This Firefox → Load Temporary Add-on → `{extensionDir}/manifest.json`
> 2. Open in the same Firefox: http://localhost:{port}#{port}:{password}
>
> Tell me when done.

**Wait for user response.**

## 4. Verify connection

Poll `status` every 3s, max 10 attempts (30s). When `connectedClients > 0` → "Ready."
- All retries exhausted → "No connection. Check extension loaded and the URL opened in the same Firefox. Re-run skill."
