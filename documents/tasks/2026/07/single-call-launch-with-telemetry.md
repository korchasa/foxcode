---
date: "2026-07-04"
status: done
variant: "B — one-call skill + `server` telemetry embedded in every launchBrowser reply"
tags: [launchbrowser, skills, telemetry, project-profile, mcp]
---

# Single-call launch: enrich `launchBrowser` with server telemetry

## Goal

The Project-Profile run skill needs exactly ONE MCP call. `launchBrowser` becomes self-sufficient: it already is idempotent and multi-session-safe, but its reply lacks the telemetry (`projectDir`, `connectedClients`, `serverVersion`, …) the agent previously fetched via a separate `status` call.

## Overview

- Variant chosen (user decision): **B** — simplify skills to one call AND embed `status`-style telemetry into every `launchBrowser` reply under a `server` key.
- Parallel sessions: no behavior change needed. `launchBrowser` already handles all races: `hasClients()` fast-path → `already-connected`; in-flight promise dedup within one process; folder-scoped `launch.lock` between processes; `reuse` verdict for a live browser owned by another session (`foxcode/channel/launch/tool.mjs`).
- User-Profile skill keeps calling `status`: it must NOT launch a browser and needs `{port, password, extensionDir}` before the manual `about:debugging` flow.
- Release: skills ship inside the CC plugin and the OpenCode npm package; CI auto-release bumps the lockstep file-set and publishes `foxcode-channel` on the next feat/fix push to main — no manual release step in this task.

## Definition of Done

- [x] `launchBrowser` MCP reply contains `server: {port, password, projectDir, extensionDir, uptime, connectedClients, pendingRequests, nodeVersion, serverVersion, pid, pluginRoot, launchMode, client}` alongside the existing launch fields (`status`, `pid`, `port`, `reason`, …) for ALL outcomes including `already-connected`, `timeout`, `error`.
- [x] Launch-result fields are never clobbered by telemetry (telemetry is nested, never spread).
- [x] `TOOL_DEFINITIONS` for `launchBrowser` documents the `server` field and states the tool is idempotent/single-call (no prior `status` needed).
- [x] `foxcode/skills/foxcode-run-project-profile/SKILL.md` + `.agents/skills/foxcode-run-project-profile/SKILL.md` collapse to ONE `launchBrowser` call; frontmatter says "One tool call".
- [x] User-Profile skills unchanged (still `status`-driven).
- [x] SRS/SDS updated: `documents/requirements.md` (FR wording "two MCP calls" → one), `documents/design.md` (tool contract line 41, launch-skills line 119).
- [x] `scripts/check.sh` green.

## Solution

1. **RED**: `foxcode/channel/lib.test.mjs` — tests for new pure `buildLaunchReply(result, server)` (nests telemetry under `server`, preserves launch fields, works for error results) and for the updated `launchBrowser` description naming `server`.
2. **GREEN**: add `buildLaunchReply` to `lib.mjs`; in `server.mjs` extract local `buildStatusPayload()` used by both the `status` case and the `launchBrowser` case (`buildLaunchReply(result, buildStatusPayload())`).
3. Update tool description in `TOOL_DEFINITIONS`.
4. Rewrite Project-Profile SKILL.md (both copies) to a single call; failure of the tool call itself ⇒ "MCP server not running".
5. Update SRS/SDS.
6. **CHECK**: `scripts/check.sh` (runs channel + opencode + scripts tests, lint).
