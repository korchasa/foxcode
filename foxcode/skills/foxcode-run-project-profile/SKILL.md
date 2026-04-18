---
name: foxcode-run-project-profile
description: >
  Launch FoxCode in Project Profile mode. Checks prerequisites, launches Firefox via web-ext, verifies connectivity.
---

# FoxCode Run — Project Profile

Launch isolated Firefox with FoxCode extension. Communicate in user's language. Be concise — minimal output, no explanations unless something fails.

**IMPORTANT**: Minimize tool calls. Each call costs ~3s of overhead. Combine bash commands. Use parallel calls where noted.

**Source of truth**: port and password come only from the MCP `status` response. Never read `~/.foxcode/port` or `~/.foxcode/password` — they are server-internal and may be stale vs. the server this skill is actually talking to.

## 1. Initial status

Call `status`. 
- Fails -> tell user "MCP server not running", stop.
- `connectedClients > 0` -> say "Ready." and stop.
- Otherwise remember `{port, password}` from the response as `PORT0`, `PASSWORD0` — these are authoritative for the current server.

## 2. Launch Firefox (background bash)

Run, substituting the values from step 1:

```bash
python3 "${CLAUDE_SKILL_DIR}/scripts/launch_firefox.py" --port <PORT0> --password <PASSWORD0>
```

Idempotent:
- Already running -> prints `Already running (PID X)`, exit 0 -> continue to step 3.
- Launched -> PID saved to `.foxcode/web-ext.pid`.
- Fails -> report stderr, stop.

## 3. Verify connection

```bash
sleep 5
```

Then poll `status` every 3s, max 3 retries.

- `connectedClients > 0` -> "Ready."
- All retries exhausted -> call `status` one final time and compare with step 1:
  - `port` or `password` differ from `PORT0`/`PASSWORD0` -> "MCP server restarted during launch (port/password rotated). Re-run skill."
  - Unchanged -> "No connection. Firefox may not have opened the start URL, or the extension is unloaded. Reload the extension via about:debugging and re-run skill."
