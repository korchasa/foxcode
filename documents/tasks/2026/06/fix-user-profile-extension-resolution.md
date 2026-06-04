---
date: "2026-06-04"
status: done
implements: [FR-15, NF-1]
tags: [bug-fix, skill, user-profile, channel, mcp]
related_tasks:
  - 2026/06/move-browser-launch-to-mcp.md
---

# Fix User Profile Skill Extension Resolution

## Goal

Restore `/foxcode:foxcode-run-user-profile` to a working state. Step 2 currently shells out to `python3 ${CLAUDE_SKILL_DIR}/../foxcode-run-project-profile/scripts/resolve_env.py` — a path deleted in task `2026/06/move-browser-launch-to-mcp.md`. The skill now aborts on every invocation with `python3: No such file or directory`, so User Profile mode (one of the two modes promised by NF-1) is effectively offline.

## Overview

### Context

- FR-15 (Browser Launch via MCP) ported Project-Profile launch into the channel and deleted `foxcode/skills/foxcode-run-project-profile/scripts/`. The Project-Profile SKILL.md was collapsed to two MCP calls (`status` + `launchBrowser`), eliminating its dependence on the Python helpers.
- User-Profile mode cannot move into MCP (loading a temporary add-on requires manual `about:debugging` interaction), so FR-15 explicitly left the User-Profile skill untouched.
- **However**, `foxcode/skills/foxcode-run-user-profile/SKILL.md` step 2 still calls `python3 ${CLAUDE_SKILL_DIR}/../foxcode-run-project-profile/scripts/resolve_env.py --format=json` to obtain `extensionDir`. That sibling path no longer exists, so the skill is broken at the first real step.
- The channel already knows the extension directory: `findExtensionDir()` in `foxcode/channel/launch/discover.mjs` resolves `<channelDir>/extension` via `import.meta.url`. It is called by `launchBrowser` (Project Profile). User-Profile mode just needs read access to that value.
- Status quo evidence:
  - `foxcode/skills/foxcode-run-user-profile/SKILL.md:22-26` (broken Python invocation)
  - `foxcode/channel/server.mjs:264-280` (`status` handler — currently returns port, password, projectDir, uptime, connectedClients, pendingRequests, nodeVersion, serverVersion, pid, pluginRoot, launchMode, client — no `extensionDir`)
  - `foxcode/channel/launch/discover.mjs:93` (`findExtensionDir()` exists and is exported)
  - `documents/tasks/2026/06/move-browser-launch-to-mcp.md` (deletion record for `scripts/`)
  - `documents/requirements.md:179-181` NF-1 acceptance currently `[x]` ("Two launch modes … User Profile") — silently false.

### Current State

- `foxcode/skills/foxcode-run-user-profile/SKILL.md`: 4 steps (status → resolve_env.py → guide → poll). Step 2 dead.
- `foxcode/channel/server.mjs`: `status` handler at line 264 returns the field set listed above, no extension path.
- `foxcode/channel/lib.mjs`: TOOL_DEFINITIONS entry for `status` documents the return shape; no `extensionDir`.
- `foxcode/channel/launch/discover.mjs::findExtensionDir(opts)`: resolves bundled extension; asserts `manifest.json` exists. Already battle-tested by `launchBrowser`.
- Tests: `foxcode/channel/*.test.mjs` exercise `status` shape implicitly via acceptance (`opencode/test/acceptance/mcp.test.mjs`). No direct unit test of `status` field set today — needs adding.
- `.agents/skills/foxcode-run-user-profile/SKILL.md`: project-scoped mirror (symlink or copy of the canonical body). Must stay in lockstep.

### Constraints

- **No new MCP round-trips for the skill**: User-Profile already calls `status` in step 1; the fix must reuse that response.
- **No new Python anywhere**: the project just finished removing Python from the launch path (FR-15). Re-introducing a Python helper is a non-starter.
- **No regression to Project-Profile launch**: `launchBrowser` continues to resolve extension via `findExtensionDir()` independently of `status`; both call sites read the same source-of-truth function.
- **Symmetry of skills**: the Codex mirror `.agents/skills/foxcode-run-user-profile/SKILL.md` must carry the same body (it is canonical-or-symlink per NF-8 evidence).
- **Source-of-truth principle**: extension path must come from the live MCP `status` response, not a disk file or env var — same rule as port/password (`foxcode/skills/foxcode-run-user-profile/SKILL.md:11`).
- **Fail-fast on absence**: if `status` reply lacks `extensionDir` (older channel version), surface that to the user verbatim — do not silently fall back to a guessed path.
- **Additive on success, tightened on failure**: `status` previously responded even with the bundled extension absent (it never read it). With this change, a misconfigured channel where `manifest.json` is missing from the bundle will see every `status` call fail. That is the desired fail-fast behaviour but is NOT purely additive — call it out in PR description.

## Definition of Done

Each item pairs (FR-ID, Test path or smoke-check, Evidence command). Tests are written RED in develop phase; this plan fixes WHERE they live.

- [ ] FR-15: `status` MCP tool response includes `extensionDir: string` (absolute path to the channel's bundled extension dir, derived from `findExtensionDir()`). Test: `foxcode/channel/status.test.mjs::status response includes extensionDir from findExtensionDir`. Evidence: `node --test foxcode/channel/status.test.mjs`.
- [ ] FR-15: `status` TOOL_DEFINITIONS description in `foxcode/channel/lib.mjs` updated to list `extensionDir` in the documented return fields. Test: `foxcode/channel/lib.test.mjs::status TOOL_DEFINITIONS description names extensionDir`. Evidence: `node --test foxcode/channel/lib.test.mjs`.
- [ ] FR-15: `extensionDir` value is exactly what `launchBrowser` resolves; no divergence between tools. Test: `foxcode/channel/status.test.mjs::extensionDir equals findExtensionDir output used by launchBrowser`. Evidence: `node --test foxcode/channel/status.test.mjs`.
- [ ] FR-15: `status` response shape is additive over the prior contract (port, password, projectDir, uptime, connectedClients, pendingRequests, nodeVersion, serverVersion, pid, pluginRoot, launchMode, client). Test: `opencode/test/acceptance/mcp.test.mjs::channel exposes status, launchBrowser, evalInBrowser tools` continues to pass; add `foxcode/channel/status.test.mjs::status response keeps all prior fields`. Evidence: `node --test opencode/test/acceptance/mcp.test.mjs foxcode/channel/status.test.mjs`.
- [ ] FR-15: SRS section `### 3.15 FR-15` gains one new Acceptance bullet for the `extensionDir` field. Initial commit lands it as `[ ]`; flips to `[x]` in the same commit that adds the implementation and its evidence reference. Test: manual — author. Evidence: `git diff documents/requirements.md` shows the bullet added; subsequent commit shows the `[ ]` → `[x]` flip alongside the channel diff.
- [ ] NF-1: `foxcode/skills/foxcode-run-user-profile/SKILL.md` drops the `python3 …/resolve_env.py` invocation; step 2 reads `extensionDir` from the step-1 `status` response. Test: skill-body regression check — `scripts/test-no-python-in-skill.sh::user-profile skill body contains no python3 invocation`. Evidence: `bash scripts/test-no-python-in-skill.sh`.
- [ ] NF-1: User-Profile skill body handles missing `extensionDir` (older channel) with a definite "upgrade `foxcode-channel`" message and stops; does NOT guess a path. Test: `scripts/test-skill-body-contract.mjs::user-profile skill mentions extensionDir absence handling`. Evidence: `node --test scripts/test-skill-body-contract.mjs`.
- [ ] NF-1: `.agents/skills/foxcode-run-user-profile/SKILL.md` is either a symlink to `foxcode/skills/foxcode-run-user-profile/SKILL.md` or a byte-equal copy. Same invariant for the Project-Profile pair. Test: `scripts/test-skill-mirror.mjs::canonical and .agents mirrors agree (project-profile + user-profile)`. Evidence: `node --test scripts/test-skill-mirror.mjs`.
- [ ] NF-1: User-Profile skill smoke — `foxcode-skill-qa` category-C cold-launch probe for `foxcode-run-user-profile` reaches the "open this URL" guide step without error. Test: `foxcode-skill-qa` category C — single probe (the same skill the project ships under `.claude/skills/foxcode-skill-qa/`). Evidence: chat transcript of the probe attached to the PR.
- [ ] NF-1: SRS NF-1 already carries a section-level `**Tasks:**` back-pointer to this task (added in plan step 5c). Stale `[x]` acceptance bullets at `documents/requirements.md:181-186` that reference deleted Python scripts remain `[x]` for now — see Follow-ups; do NOT touch them in this task's surgical edit budget. Test: n/a (documentation-debt note). Evidence: chat note in PR description.
- [ ] No dangling references remain in any shipped skill body. Test: `scripts/test-no-dangling-script-refs.sh::no SKILL.md under foxcode/skills/ or .agents/skills/ references foxcode-run-project-profile/scripts/`. Evidence: `bash scripts/test-no-dangling-script-refs.sh`.

## Solution

### Selected variant: A — Extend `status` response with `extensionDir`

Surface the bundled extension path through the existing `status` MCP tool. The User-Profile skill reuses its step-1 `status` call and drops the Python helper entirely.

### Files to modify

- `foxcode/channel/server.mjs` — `status` handler.
- `foxcode/channel/lib.mjs` — `TOOL_DEFINITIONS[status].description`.
- `foxcode/skills/foxcode-run-user-profile/SKILL.md` — collapse from 4 steps to 3.
- `.agents/skills/foxcode-run-user-profile/SKILL.md` — mirror (symlink check first; if it's a real file, edit in lockstep).
- `documents/requirements.md` — extend FR-15 acceptance with the new field; update NF-1 evidence; insert `**Tasks:**` back-pointers (handled in step 5c).
- `documents/index.md` — register FR-15 / NF-1 rows under `## FR` (handled in step 5b).

### Files to create

- `foxcode/channel/status.test.mjs` — unit test for the enriched `status` response (RED → GREEN).
- `scripts/test-no-dangling-script-refs.sh` — repo guard: grep every `foxcode/skills/**/SKILL.md` and `.agents/skills/**/SKILL.md` for `foxcode-run-project-profile/scripts/`; exit non-zero on any hit.
- `scripts/test-no-python-in-skill.sh` — (or extend if already present from FR-15) grep `python3` in user-facing skill bodies; fail if found.
- `scripts/test-skill-mirror.mjs` — assert `.agents/skills/foxcode-run-user-profile/SKILL.md` is either a symlink to or byte-equal copy of `foxcode/skills/foxcode-run-user-profile/SKILL.md`. Same check for `foxcode-run-project-profile` (catch future drift cheaply).

(Before creating `test-no-python-in-skill.sh` and `test-skill-mirror.mjs`, verify they don't already exist under `scripts/`. If they do, extend instead — `git ls-files scripts/ | grep -E 'mirror|no-python'`.)

### Channel changes — `status` handler

In `foxcode/channel/server.mjs:264-280`:

```js
case 'status': {
  const status = {
    port: PORT,
    password: PASSWORD,
    projectDir: resolveProjectDir(),
    extensionDir: findExtensionDir(),   // NEW — same source of truth as launchBrowser
    uptime: process.uptime(),
    connectedClients: clients.size,
    pendingRequests: pendingToolRequests.size,
    nodeVersion: process.version,
    serverVersion: pluginMeta.version,
    pid: process.pid,
    pluginRoot: process.env.CLAUDE_PLUGIN_ROOT || null,
    launchMode: process.env.CLAUDE_PLUGIN_ROOT ? 'plugin' : 'dev',
    client: clientInfo,
  }
  return { content: [{ type: 'text', text: JSON.stringify(status) }] }
}
```

`findExtensionDir()` is already imported at `server.mjs:24` and asserts `manifest.json` exists at the resolved path (fail-fast). No new error-handling code needed — if the bundled extension is missing, `status` throws and the agent sees the error verbatim, which is the correct outcome.

### Channel changes — TOOL_DEFINITIONS description

`foxcode/channel/lib.mjs:262`:

```js
description: 'Get server status and telemetry. Always works, does not require browser connection. Returns port, password, projectDir, extensionDir, uptime, connectedClients, pendingRequests, nodeVersion, serverVersion.',
```

### Skill rewrite — `foxcode/skills/foxcode-run-user-profile/SKILL.md`

New body (full replacement of the existing 49-line file):

```markdown
---
name: foxcode-run-user-profile
description: >
  Launch FoxCode in User Profile mode. Guides user to load extension via about:debugging, opens connection page, verifies connectivity.
---

# FoxCode Run — User Profile

Load extension into user's Firefox, connect, verify. Communicate in user's language. Be concise — minimal output, no explanations unless something fails.

**Source of truth**: port, password, AND extensionDir come only from the MCP `status` response. Never read `~/.foxcode/*` directly — those files may belong to a different server.

## 1. Status

Call `status`.
- Fails -> tell user "MCP server not running", stop.
- `connectedClients > 0` -> say "Ready." and stop.
- Otherwise remember `{port, password, extensionDir}` from the response as `PORT0`, `PASSWORD0`, `EXT_DIR`.
- If `extensionDir` is absent (older channel) -> tell user "Channel too old; upgrade `foxcode-channel`", stop.

## 2. Guide loading

Tell user (single message, substituting values from step 1):

> 1. Load extension: `about:debugging` -> This Firefox -> Load Temporary Add-on -> `{EXT_DIR}/manifest.json`
> 2. Open in the same Firefox: `http://localhost:{PORT0}#{PORT0}:{PASSWORD0}`
>
> Tell me when done.

**Wait for user response.**

## 3. Verify connection

Poll `status` every 3s, max 10 attempts (30s).

- `connectedClients > 0` -> "Ready."
- All retries exhausted -> call `status` one final time and compare with step 1:
  - `port` or `password` differ from `PORT0`/`PASSWORD0` -> "MCP server restarted (port/password rotated). Re-run skill."
  - Unchanged -> "No connection. Check extension loaded and the URL opened in the same Firefox. Re-run skill."
```

The Codex mirror (`.agents/skills/foxcode-run-user-profile/SKILL.md`) receives the identical body — but first run `ls -la .agents/skills/foxcode-run-user-profile/SKILL.md` to confirm whether it's a symlink (no edit needed) or a copy (edit in lockstep).

### Tests — RED → GREEN

1. `foxcode/channel/status.test.mjs` (NEW):
   - `status response includes extensionDir from findExtensionDir`: spawn the channel with a mocked `findExtensionDir` returning a temp dir holding `manifest.json`; call `status` over the in-process MCP client; assert `extensionDir` field equals the mock return.
   - `status response field set is stable`: assert the response contains exactly the documented field names; guards against accidental removal in future refactors.
   - `extensionDir equals findExtensionDir output used by launchBrowser`: mock `findExtensionDir` once with side-effect counter; call `status` then `launchBrowser`; assert both received the same value.
2. `foxcode/channel/lib.test.mjs` (extend if exists, create otherwise):
   - `status TOOL_DEFINITIONS description names extensionDir`: regex-grep the description string for the literal `extensionDir`. This pins the public-doc-vs-impl invariant.
3. `scripts/test-no-dangling-script-refs.sh` (NEW): for every `*.md` under `foxcode/skills/` and `.agents/skills/`, fail if the body contains `foxcode-run-project-profile/scripts/`.
4. `scripts/test-no-python-in-skill.sh` (NEW or extend): grep `python3` / `\.py\b` in shipped skill bodies; fail on hit.
5. `scripts/test-skill-mirror.mjs` (NEW): assert symlink-or-byte-equal for both run skills against their `.agents/skills/` counterparts.

### Sequence (RED → GREEN → REFACTOR → CHECK)

1. **Guard tests first** — write `test-no-dangling-script-refs.sh`, `test-no-python-in-skill.sh`, `test-skill-mirror.mjs`. Run them — they should FAIL on the current state (broken user-profile skill).
2. **Channel test first** — write `status.test.mjs` asserting `extensionDir` field. Run — FAILS (field absent).
3. **GREEN — channel** — add `extensionDir: findExtensionDir()` line; update `lib.mjs` description. Re-run channel tests — PASS.
4. **GREEN — skill** — overwrite `foxcode/skills/foxcode-run-user-profile/SKILL.md` with the new body. If `.agents/...` is a real file, copy. Re-run guard tests — PASS.
5. **REFACTOR** — none expected; the diff is additive.
6. **CHECK** — `bash scripts/check.sh && bash scripts/test.sh`.
7. **Docs** — extend FR-15 acceptance (new `[x]` line for `extensionDir`); update NF-1 evidence line for the user-profile skill flow; back-pointer + index changes happen in this skill's steps 5b/5c.
8. **Smoke** — manual: in a fresh Firefox without the extension, run `/foxcode:foxcode-run-user-profile`, follow instructions, confirm connection. Re-run skill — should report `Ready.` from step 1 (idempotent).

### Verification commands

- Channel unit + integration: `node --test foxcode/channel/status.test.mjs foxcode/channel/lib.test.mjs`
- Skill body guards: `bash scripts/test-no-dangling-script-refs.sh && bash scripts/test-no-python-in-skill.sh && node --test scripts/test-skill-mirror.mjs`
- Full check: `bash scripts/check.sh && bash scripts/test.sh && npm --prefix foxcode/channel test`
- Tier-4: `bash scripts/test-ide-skill.sh` (project-profile path); user-profile smoke remains manual per FR-11 backlog.
- Skill-QA category A re-run: subagent re-applies `references/rubric.md` to both `foxcode-run-*` SKILL.md files; static review must report `flow: pass` for user-profile after the fix.

### Error-handling strategy

- `findExtensionDir()` throws on missing `manifest.json` → MCP returns the error verbatim → agent shows it to the user. Fail-fast, no fallback path (per AGENTS.md rule "no fallbacks silently").
- Skill explicitly handles the "older channel without `extensionDir`" case with a clear "upgrade channel" message — no guess at the path, no silent skip.
- All other branches (status fails, connectedClients>0, retry exhausted with/without port-rotation) are unchanged from current SKILL.md semantics.

## Follow-ups (deferred)

- FR-11 (Simplified User Profile Onboarding) auto-open + copyable manifest + automatic polling — still unimplemented; this task does **not** deliver FR-11, only restores baseline functionality. Open a separate task once FR-11 is prioritised.
- Once `extensionDir` is in `status`, consider exposing the same field in the popup's diagnostic panel so users can copy it without opening a chat with the agent.
- **SRS truth-debt around NF-1 acceptance bullets** (`documents/requirements.md:182-186`): three `[x]` bullets still cite deleted Python files (`resolve_env.py`, `launch_firefox.py`, `test_launch_firefox.py`). FR-15 commit moved the behaviour into the channel but left the bullets in place. Open a documentation-only follow-up to either re-cite the new Node evidence (`foxcode/channel/launch/*.mjs`) or restructure NF-1 acceptance to reference FR-15 instead of duplicating it.
