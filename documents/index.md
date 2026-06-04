# Documentation Index

Agent-maintained navigation: maps each requirement (FR-* / NF-*) to its SRS section, summary, and current status.

## FR

- [FR-1](requirements.md#31-fr-1-eval-debug-popup) — Eval Debug Popup (on-demand browser_action; eval log; badge counter) — `[x]`
- FR-2 — Send Messages — `[REMOVED]` (browser is read-only)
- FR-3 — Page Context Injection — `[SUPERSEDED by FR-5]`
- [FR-4](requirements.md#34-fr-4-project-context) — Project Context (agent session operates in chosen project dir) — `[x]`
- [FR-5](requirements.md#35-fr-5-browser-automation-via-evalinbrowser) — Browser Automation via `evalInBrowser` (single MCP tool with ~36 async API helpers) — `[x]` (one Tier-3 hermetic integration test still pending)
- [FR-6](requirements.md#36-fr-6-multi-session-support) — Multi-Session Support (N WebSocket sessions per extension) — `[x]` (Tier-3 hermetic 2-server scenario still pending)
- [FR-7](requirements.md#37-fr-7-disconnect-notifications) — Disconnect Notifications — `[ ]`
- [FR-8](requirements.md#38-fr-8-structured-eval-log) — Structured Eval Log — `[ ]`
- [FR-9](requirements.md#39-fr-9-informative-session-names) — Informative Session Names — `[ ]`
- [FR-10](requirements.md#310-fr-10-connection-page-quick-start) — Connection Page Quick-Start — `[ ]`
- [FR-11](requirements.md#311-fr-11-simplified-user-profile-onboarding) — Simplified User Profile Onboarding — `[ ]`
- [FR-12](requirements.md#312-fr-12-semantic-badge) — Semantic Badge — `[ ]`
- [FR-13](requirements.md#313-fr-13-clear-log) — Clear Log — `[ ]`
- [FR-14](requirements.md#314-fr-14-reconnect-progress) — Reconnect Progress — `[ ]`
- [FR-15](requirements.md#315-fr-15-browser-launch-via-mcp) — Browser Launch via MCP (channel-owned Firefox lifecycle, `launchBrowser` tool, skill collapsed to two MCP calls; `status` also surfaces `extensionDir` for User-Profile flow) — `[x]`

## NF

- [NF-1](requirements.md#41-nf-1-easy-install-via-claude-code-plugin-critical) — Easy Install via Claude Code Plugin (marketplace install + self-contained launch skills; User-Profile mode reads `extensionDir` from `status`) — `[x]`
- [NF-2](requirements.md#42-nf-2-easy-launch-very-important) — Easy Launch (status + launch flows; URL-hash auto-connect) — `[x]`
- [NF-3](requirements.md#43-nf-3-reliability-very-important) — Reliability (per-session auto-reconnect, graceful degradation) — `[~]` (no-message-loss invariant unverified)
- [NF-4](requirements.md#44-nf-4-simplicity-important) — Simplicity (1 MCP server + 1 extension) — `[x]`
- [NF-5](requirements.md#45-nf-5-security) — Security (localhost-only, upgrade-level password auth) — `[x]`
- [NF-6](requirements.md#46-nf-6-performance) — Performance (<1s message latency) — `[x]`
- [NF-7](requirements.md#47-nf-7-easy-install-in-opencode-important) — Easy Install in OpenCode (npm-distributed plugin auto-seeds launch skills + emits MCP snippet; CLI fallback) — `[~]` (e2e smoke pending)
- [NF-8](requirements.md#48-nf-8-project-scoped-codex-support-important) — Codex Support (repo-scoped `.codex/config.toml` + `.agents/skills` wrappers verified; native plugin marketplace payload pending via unified `npx foxcode-channel` distribution — task `2026/06/unify-mcp-distribution-via-npx.md`) — `[~]` (marketplace pending)
- [NF-9](requirements.md#49-nf-9-self-contained-plugin-payload-important) — Self-Contained Plugin Payload (channel + extension both ship inside `foxcode-channel` npm package; IDE plugin payloads carry skills only) — `[x]`
