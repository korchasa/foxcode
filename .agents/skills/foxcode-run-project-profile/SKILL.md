---
name: foxcode-run-project-profile
description: Launch FoxCode in Project Profile mode from Codex via the foxcode MCP server (`launchBrowser`). One tool call, no Python.
---

# FoxCode Run — Project Profile

Use the canonical skill at `foxcode/skills/foxcode-run-project-profile/SKILL.md`.

Codex notes:

- The flow is ONE MCP tool call (`launchBrowser`). No prior `status` call, no Python script invocation. The tool is idempotent and multi-session-safe; its reply embeds `status`-style telemetry under `server`.
- The foxcode MCP server is registered in `~/.codex/config.toml` as `npx -y foxcode-channel@<pinned>`. The channel npm package ships everything needed (Firefox extension included), so no marketplace payload or plugin env vars are required for launch.
- Communicate in the user's language. Keep output minimal unless something fails.
