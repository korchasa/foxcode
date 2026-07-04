---
name: foxcode-run-project-profile
description: >
  Launch FoxCode in Project Profile mode via the foxcode MCP server (`launchBrowser` tool). One tool call, no Python.
---

# FoxCode Run — Project Profile

Launch isolated Firefox with the FoxCode extension. Talk to the user in their language. Be concise — minimal output, no explanations unless something fails.

The Firefox lifecycle is owned by the MCP channel: when the IDE session ends or the channel is killed, the launched Firefox closes with it.

## Launch (the only step)

Call MCP tool `launchBrowser` (no arguments are required; defaults work). Do NOT call `status` first — `launchBrowser` is idempotent: with a browser already connected it returns instantly without spawning anything, and parallel sessions in the same folder never start a second Firefox.

- Tool call itself fails → tell user "MCP server not running", stop.

The tool reply is JSON. Interpret `status`:

- `connected` → "Ready."
- `already-connected` → "Ready."
- `already-running` → "Ready." (a managed Firefox is already alive on the current port).
- `timeout` → relay the JSON reply unchanged; suggest the user reload the extension and re-run the skill.
- `error` → relay `reason`; common causes are missing Firefox binary or no free WebSocket port.

The reply also carries a nested `server` object with channel telemetry (`port`, `projectDir`, `connectedClients`, `serverVersion`, …) — use it for diagnostics instead of a separate `status` call.

That is the whole flow — one tool call, no Python, no `${CLAUDE_SKILL_DIR}/scripts/*`, no PID files to manage from the agent side.
