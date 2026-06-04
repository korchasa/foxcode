---
name: foxcode-run-user-profile
description: Launch FoxCode in User Profile mode from Codex. Guides extension loading via about:debugging, opens connection page, verifies connectivity.
---

# FoxCode Run — User Profile

Use the canonical skill at `foxcode/skills/foxcode-run-user-profile/SKILL.md`.

Codex notes:

- The flow is MCP-only. No Python script invocation.
- The foxcode MCP server is registered in `~/.codex/config.toml` as `npx -y foxcode-channel@<pinned>`. The channel npm package ships the Firefox extension; `status` returns its absolute path via `extensionDir`.
- `port`, `password`, and `extensionDir` come exclusively from the live `status` response — never read `~/.foxcode/*` directly.
- Communicate in the user's language. Keep output minimal unless something fails.
