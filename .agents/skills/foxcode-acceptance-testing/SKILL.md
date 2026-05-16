---
name: foxcode-acceptance-testing
description: >
  Run FoxCode acceptance testing when asked to verify that FoxCode works end-to-end, smoke-test browser automation, validate evalInBrowser, check Claude Code/OpenCode/Codex integration, or prove a release candidate works with real Firefox.
---

# FoxCode Acceptance Testing

Use this skill to test behavior, not packaging. For install/update/package contents, use `foxcode-distribution-testing`.

## Ground rules

- Read `documents/requirements.md` and `documents/design.md` before testing.
- Use relative paths in commands from the repository root.
- Do not skip a tier silently. If a prerequisite is missing, record it as `blocked` with the command output.
- Do not edit code unless the user asked to fix failures. For a test-only request, stop at diagnosis.
- Keep evidence: command, result, and the exact failing line or tool output.
- If Firefox, Claude Code, OpenCode, Codex, or token-consuming checks are required, state that explicitly before running them.

## Test tiers

### Tier 0: repository baseline

Run:

```bash
bash scripts/check.sh
```

This covers syntax, unit tests, MCP stdio acceptance, WebSocket bridge acceptance, OpenCode package tests, Codex config validation when Codex is installed, and launch helper tests.

If this fails, diagnose the failing component before moving to higher tiers.

### Tier 1: local channel telemetry

Use the active FoxCode MCP server when available:

- Call `status`.
- Expect a live port in `8787..8886`, a password, `serverVersion`, `projectDir`, and `connectedClients`.
- `connectedClients == 0` is acceptable before browser launch, but not after a launch skill reports ready.

If the MCP tool is unavailable, use the relevant host diagnostics:

```bash
codex mcp get foxcode
opencode mcp list
claude mcp list
```

### Tier 2: extension connection and browser round trip

Launch with the project-profile skill (`foxcode-run-project-profile`) unless the user specifically asks for the user profile.

After launch:

- Call `status` again.
- Require `connectedClients > 0`.
- Run one harmless `evalInBrowser` smoke:

```javascript
await api.navigate("https://example.com");
return await api.getTitle();
```

Expected title: `Example Domain`.

Then run a DOM smoke:

```javascript
await api.navigate("https://example.com");
const text = await api.$("h1");
return text.textContent;
```

Expected result: `Example Domain`.

### Tier 3: popup/session behavior

Use this tier when the change touches the extension background, popup, badge, sessions, reconnection, or eval log.

Verify:

- Popup receives `tool_use` and `tool_result` entries after `evalInBrowser`.
- Badge count increments for requests and resets when the popup opens, if badge behavior is in scope.
- Re-running the launch skill is idempotent: same port stays ready; stale PID on a different port is replaced.
- Multi-session behavior only when explicitly in scope: two MCP servers, one extension, both sessions visible.

### Tier 4: real IDE acceptance

Use this when validating a release candidate or changes to Claude Code, OpenCode, Codex, MCP startup, or launch skills.

Run:

```bash
bash scripts/test-ide.sh
```

This uses real Claude Code, real OpenCode, real Codex, and real Firefox. It may consume model tokens and takes longer than the baseline.

If it fails, inspect the generated acceptance logs first, then classify the failure:

- IDE startup/config failure.
- MCP server startup failure.
- Firefox/extension launch failure.
- WebSocket connection failure.
- `evalInBrowser` behavior failure.
- External environment failure.

## Report format

Return a concise verdict:

- `pass`: all requested tiers passed.
- `blocked`: a required prerequisite or external environment was unavailable.
- `fail`: a FoxCode behavior regressed.

Include:

- Tiers run.
- Evidence commands and key output.
- Root cause if known.
- Next action, only if there is a concrete one.
