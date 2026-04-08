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
If `connectedClients > 0` -> say "Ready." and stop.

## 2. Launch Firefox (background bash)

```bash
python3 "${CLAUDE_SKILL_DIR}/scripts/launch_firefox.py"
```

Idempotent: resolves environment (Firefox, extension, port, password) and launches web-ext.
If already running -> prints "Already running (PID X)", exit 0 -> tell user, go to step 3.
If launched -> PID saved to `.foxcode/web-ext.pid`. If fails -> report error from stderr, stop.

## 3. Verify connection

```bash
sleep 5
```

Then call `status`. If `connectedClients > 0` -> "Ready."
- Not connected -> wait 3s, retry `status` (max 3 retries).
- All retries exhausted -> "No connection. Open sidebar: View > Sidebar > FoxCode. Re-run skill."
