# Documentation Index

Agent-maintained navigation: maps each requirement (FR-* / NF-*) to its SRS section, summary, and current status.

## FR

- [FR-15](requirements.md#315-fr-15-browser-launch-via-mcp) — Browser Launch via MCP (channel-owned Firefox lifecycle, `launchBrowser` tool, skill collapsed to two MCP calls; `status` also surfaces `extensionDir` for User-Profile flow) — `[x]`

## NF

- [NF-1](requirements.md#41-nf-1-easy-install-via-claude-code-plugin-critical) — Easy Install via Claude Code Plugin (marketplace install + self-contained launch skills; User-Profile mode reads `extensionDir` from `status`) — `[~]` (NF-1 acceptance bullets at `requirements.md:182-186` still cite deleted Python helpers — documentation-only follow-up tracked in this task's "Follow-ups")
- [NF-7](requirements.md#47-nf-7-easy-install-in-opencode-important) — Easy Install in OpenCode (npm-distributed plugin auto-seeds launch skills + emits MCP snippet; CLI fallback) — `[~]` (e2e smoke pending)
- [NF-8](requirements.md#48-nf-8-project-scoped-codex-support-important) — Codex Support (repo-scoped `.codex/config.toml` + `.agents/skills` wrappers verified; native plugin marketplace payload pending via unified `npx foxcode-channel` distribution — task `2026/06/unify-mcp-distribution-via-npx.md`) — `[~]` (marketplace pending)
- [NF-9](requirements.md#49-nf-9-self-contained-plugin-payload-important) — Self-Contained Plugin Payload (extension lives inside `foxcode/`; one layout for CC plugin, marketplace clone, and OpenCode bundle) — `[x]`
