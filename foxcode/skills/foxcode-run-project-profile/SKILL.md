---
name: foxcode-run-project-profile
description: >
  Launch FoxCode in Project Profile mode via the foxcode MCP server (`launchBrowser` tool). Two tool calls, no Python.
---

# FoxCode Run — Project Profile

Launch isolated Firefox with the FoxCode extension. Talk to the user in their language. Be concise — minimal output, no explanations unless something fails.

The Firefox lifecycle is owned by the MCP channel: when the IDE session ends or the channel is killed, the launched Firefox closes with it.

## 1. Status

Call MCP tool `status`.

- Fails → tell user "MCP server not running", stop.
- `connectedClients > 0` → say "Ready." and stop. Do not relaunch in the same session.

## 2. Launch

Call MCP tool `launchBrowser` (no arguments are required; defaults work).

The tool reply is JSON. Interpret `status`:

- `connected` → "Ready."
- `already-connected` → "Ready."
- `already-running` → "Ready." (a managed Firefox is already alive on the current port).
- `timeout` → relay the JSON reply unchanged; suggest the user reload the extension and re-run the skill.
- `error` → relay `reason`; common causes are missing Firefox binary or no free WebSocket port.

That is the whole flow — no Python, no `${CLAUDE_SKILL_DIR}/scripts/*`, no PID files to manage from the agent side.
