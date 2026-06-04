---
name: foxcode-run-project-profile
description: Launch FoxCode in Project Profile mode from Codex via the foxcode MCP server (`launchBrowser`). Two tool calls, no Python.
---

# FoxCode Run — Project Profile

Use the canonical skill at `foxcode/skills/foxcode-run-project-profile/SKILL.md`.

Codex notes:

- The flow is two MCP tool calls (`status`, then `launchBrowser`). No Python script invocation.
- The foxcode MCP server is registered in `~/.codex/config.toml` as `npx -y foxcode-channel@<pinned>`. The channel npm package ships everything needed (Firefox extension included), so no marketplace payload or plugin env vars are required for launch.
- Communicate in the user's language. Keep output minimal unless something fails.
