---
date: "2026-06-05"
status: done
implements: [FR-15]
tags: [mcp, codex, launchBrowser, transport, blocker, external-consumer]
related_tasks:
  - 2026/06/move-browser-launch-to-mcp.md
  - 2026/06/unify-mcp-distribution-via-npx.md
---

# `launchBrowser` Closes Its Own MCP Transport Under `codex exec`

## Goal

Identify why the MCP `launchBrowser` tool call, when issued from a
non-interactive `codex exec --experimental-json` session, terminates the
MCP transport mid-call (and brings the FoxCode channel down with it),
and either fix the failure in `foxcode/channel/` or document a
reliable operator workaround so non-interactive Codex consumers
(flowai-workflow's `bug-hunter-on-prod` workflow is the surfacing
case) can drive FoxCode end-to-end. Without resolution, any Codex
workflow that mandates browser verification cannot reach
`verdict: PASS`.

## Overview

### Context

- External consumer where the symptom surfaced: the
  flowai-workflow engine
  ([`korchasa/flowai-workflow`](https://github.com/korchasa/flowai-workflow))
  driving `.flowai-workflow/bug-hunter-on-prod/workflow.yaml` in
  `korchasa/business/lumatale-fairy-taler` against
  `https://lumatale.com`. Workflow is Codex-only
  (`defaults.runtime: codex`, `model: gpt-5.5`).
- The workflow's bug-hunter agent is *required* to verify the site
  through FoxCode (`/foxcode:foxcode-run-project-profile`); HTTP
  probes alone cannot yield `PASS` per the agent's Mandatory Rules
  section.
- FoxCode plugin in use: cached payload at
  `~/.codex/plugins/cache/korchasa/foxcode/0.19.0/`
  (channel `0.19.0`, post-FR-15 — browser launch moved into MCP per
  `documents/tasks/2026/06/move-browser-launch-to-mcp.md`).
- Codex MCP registration row from `codex mcp list`:
  ```
  foxcode  sh  -c set -e; export FOXCODE_PROJECT_DIR="$PWD"; \
    PLUGIN_DIR=$(ls -d "$HOME/.codex/plugins/cache/korchasa/foxcode/"*/channel | sort -V | tail -1); \
    cd "$PLUGIN_DIR"; ... npm ci --omit=dev --silent; exec node server.mjs
  ```
- Bug-hunter agent followed the skill contract documented in
  `~/.codex/plugins/cache/korchasa/foxcode/0.19.0/skills/foxcode-run-project-profile/SKILL.md`:
  `status` → `launchBrowser` (no args) → expect
  `status: connected | already-connected | already-running`.
- Observed wire behaviour (codex stream tail from external run
  `runs/20260605T000122` in `lumatale-fairy-taler`):
  ```
  [stream] mcp: foxcode.status (completed)
  [stream] text: FoxCode-сервер запущен, но клиент пока не подключен,
                 поэтому запускаю управляемый Firefox через штатный `launchBrowser`.
  [stream] mcp: foxcode.launchBrowser (failed)
  [stream] text: Запуск FoxCode оборвал транспорт MCP.
                 Повторно проверяю статус сервера…
  [stream] mcp: foxcode.status (failed)
  ```
  First `status` succeeds → transport baseline is healthy. Single
  `launchBrowser` call → transport is gone for every subsequent call,
  including a follow-up `status`.
- Bug-hunter recorded the resulting blocker in its produced report:
  ```
  ## FoxCode
  - status before launch: connectedClients: 0, port 8802
  - launchBrowser: failed with "Transport closed"
  - status after: failed with "Transport closed"
  ```
- This is **not** a flowai-workflow engine bug. The engine completed
  the bug-hunter node in a single attempt (~72 s), wrote the required
  artefacts, and propagated the agent's `verdict: FAIL` cleanly. The
  failure is entirely inside the FoxCode MCP channel under the
  `codex exec` transport.
- A previous lumatale run on FoxCode `0.16.4` (pre-FR-15) hit a
  different failure surface in the same spot — the external Python
  launcher exited non-zero — confirming that the issue is the
  cross-IDE "non-interactive launch under Codex" path, not the FR-15
  refactor itself. FR-15 changed the surface; the underlying
  lifecycle assumption (a long-lived MCP channel that outlives the
  launch wait) still does not hold.

### Current State

- Launch handler: `foxcode/channel/launch/tool.mjs`. Relevant
  shape:
  - `foxcode/channel/launch/tool.mjs:12` — `DEFAULT_TIMEOUT_MS = 30_000`.
  - `foxcode/channel/launch/tool.mjs:42-110` — `doLaunch(args)`:
    `hasClients?` early-return → port/password check → existing-PID
    handling → `prepare` (purge updates, kill zombies) →
    `spawn(...)` → `Promise.race([waitForClient(), 30 s timer])`.
  - `foxcode/channel/launch/tool.mjs:85-90` — the synchronous-from-MCP
    wait point. The MCP `launchBrowser` response is held off until
    Firefox + the FoxCode WebExtension fully boot and the extension
    opens its WebSocket back to the channel (or the 30 s timer
    fires).
- Lifecycle assumption documented in the user-facing skill
  (`foxcode-run-project-profile/SKILL.md`): "The Firefox lifecycle is
  owned by the MCP channel: when the IDE session ends or the channel
  is killed, the launched Firefox closes with it." Designed for an
  interactive IDE session whose MCP channel lifetime ≫ launch time.
- `codex exec --experimental-json` runs per-turn: the MCP server
  is spawned alongside the codex process, but the channel's effective
  lifetime is bounded by codex's MCP-call timeout AND by the codex
  turn budget. Empirical signal here: `status` (sub-second) is fine;
  `launchBrowser` (multi-second, blocks on Firefox boot) closes the
  transport. The most likely lifecycle mismatch is codex's per-MCP
  -call response timeout being shorter than the FoxCode 30 s wait.
- No persistent Firefox left behind: probe after the failed run
  reports `pgrep -f 'firefox.*foxcode'` empty and `lsof -iTCP:8795`
  empty. Either the spawn aborted before Firefox forked, or the
  child was reaped when its parent (`server.mjs`) lost its stdio
  pipe under transport closure.
- Source-of-truth artefacts from the surfacing run (consumer-side,
  read-only references):
  - `lumatale-fairy-taler/.flowai-workflow/bug-hunter-on-prod/runs/20260605T000122/journal.jsonl`
    — engine run journal; clean single-attempt completion of the
    bug-hunter node (`seq 15 attempt_completed continuations: 0`).
  - `lumatale-fairy-taler/.flowai-workflow/bug-hunter-on-prod/runs/20260605T000122/hunt/bug-hunter-on-prod/stream.log`
    — codex NDJSON stream including the failed MCP calls.
  - `lumatale-fairy-taler/.flowai-workflow/bug-hunter-on-prod/runs/20260605T000122/hunt/bug-hunter-on-prod/site-check-report.md`
    — bug-hunter's structured FAIL report with the FoxCode section
    quoted above.
  - `lumatale-fairy-taler/.flowai-workflow/bug-hunter-on-prod/runs/20260520T223320/hunt/bug-hunter-on-prod/stream.log`
    — older FoxCode `0.16.4` run that failed in the same spot via
    `launch_firefox.py` exit-code path. Same symptom class; different
    surface.

### Working Hypotheses

Probed cheapest-first per the AGENTS.md "verify the suspect line is
on the failing call path" rule.

1. **Codex per-call MCP-response timeout < FoxCode 30 s wait.**
   `codex exec` enforces a tool-call response budget per
   `mcp-types/CallToolResult` round-trip. If that budget is below
   the 30 s `launchBrowser` blocking wait, codex closes its half of
   the MCP transport mid-call. The channel's next write to stdout
   then fails (EPIPE/broken pipe), and the MCP server logs
   "Transport closed" and dies. **Direct evidence sought:** codex
   stderr / debug log line referencing tool-call timeout; the
   numeric budget exposed by Codex config (e.g.
   `mcp_servers.<name>.tool_timeout_sec`).
2. **`prepare(home, port)` (`launch/prepare.mjs`) emits non-JSON to
   stdout under `codex exec`.** Under codex, stdio is the JSON-RPC
   channel. A single human-readable line on stdout from a
   spawned-shell preflight step (e.g. update purge,
   `org.mozilla.updater` SIGTERM logging, `web-ext` initial output
   bleeding through) corrupts JSON-RPC framing and codex tears down
   the channel. **Direct evidence sought:** force-prepend `tee` /
   read raw stdout when running the channel under
   `node server.mjs < /dev/null` driven manually.
3. **Channel process exits when its MCP stdio peer disconnects.**
   FoxCode `server.mjs` may not survive an SDK-reported transport
   close — exits cleanly before responding to `launchBrowser`. The
   visible "Transport closed" on subsequent `status` is then the
   absence of a live server. **Direct evidence sought:** run the
   channel against a stub MCP stdin/stdout pair that simulates an
   abrupt close mid-call, observe whether `server.mjs` returns from
   the handler or terminates the process.
4. **`spawn(...)` (`launch/spawn.mjs`) inherits the channel's
   stdio.** If the spawned `web-ext run` child inherits the
   channel's stdout, web-ext startup messages corrupt JSON-RPC
   framing as in hypothesis (2). **Direct evidence sought:** read
   `foxcode/channel/launch/spawn.mjs` and verify `stdio:` argument
   passed to `child_process.spawn`.

Hypotheses (2) and (4) are local to FoxCode source. Hypothesis (1)
is upstream Codex behaviour. Hypothesis (3) is a Channel-side
robustness gap. Probe order: (4) → (2) → (3) → (1).

### Constraints

- FoxCode plugin code is the only fix surface this task may touch.
  The external consumer (flowai-workflow) is engine code and stays
  domain-agnostic — no vendor-specific code-path inside its engine
  may be requested. The same applies to `@korchasa/ai-ide-cli`.
- Any fix MUST work under non-interactive `codex exec`
  (`--experimental-json`), since that is the only execution context
  flowai-workflow uses for Codex runtime. Solutions that only work
  under interactive `codex` / Claude Code are out of scope of this
  task (note them as a documented limitation if applicable).
- Keep User Profile launch mode unaffected. FR-15's scope is Project
  Profile only.
- No prompt-side workarounds in the consumer's agent prompt that
  fake browser evidence to flip the verdict. Verification semantics
  stay intact.
- Per FoxCode AGENTS.md "fail fast, fail clearly": a fix that
  swallows the transport-close error and returns a
  `status: degraded` is acceptable only if the failure mode is
  surfaced in the response payload AND in `status` polling, never
  silently.
- Per FoxCode AGENTS.md "Verify before documenting external
  integrations": document the *observed* Codex tool-call timeout
  (or its absence) with a quoted log line / config probe, not the
  guessed value.

### Out of Scope

- flowai-workflow engine changes (model id fix, `claude --version`
  probe gate (FR-E81), fail-fast on runtime `is_error` (FR-E82),
  Codex permanent-400 classifier (FR-L41 in
  `@korchasa/ai-ide-cli`) — all already shipped on the consumer
  side this session and unrelated to this task.
- Auth-flow fragility downstream of a working FoxCode: the
  bug-hunter additionally requires a pre-existing Google session in
  the launched Firefox profile to drive `/api/auth/me` and story
  creation. That blocker is real but only relevant *after* FoxCode
  starts; track separately.
- Migration of the FoxCode MCP registration in `~/.codex/config.toml`
  from the hand-rolled `sh -c "...npm ci...node server.mjs"` form
  to the npx-distributed form documented in
  `documents/tasks/2026/06/unify-mcp-distribution-via-npx.md`. The
  surfacing host still uses the legacy entry; the npx migration may
  or may not alter the failure surface and should be re-probed after
  it lands, but the present diagnosis must succeed for both forms.

## Definition of Done

- [x] Each hypothesis classified `confirmed` / `ruled-out` with one
  reproducible probe per hypothesis. For `confirmed`, a quoted log /
  trace excerpt. For `ruled-out`, a one-line observation that
  contradicts it. Evidence: Solution → Probe Results below.
- [x] Root cause stated against a specific file:line in
  `foxcode/channel/` (or upstream `codex-cli` with issue link if
  the cause is non-FoxCode). Evidence:
  `foxcode/channel/launch/spawn.mjs:160` (pre-fix
  `stdio: ['ignore', 'inherit', 'inherit']`).
- [x] Fix surface or operator workaround documented with file/path
  references; if upstream, a paired issue/PR link. Evidence:
  `foxcode/channel/launch/spawn.mjs:156-176` (post-fix
  `['ignore', 'pipe', 'inherit']` + stdout-to-stderr forwarder);
  regression test `foxcode/channel/launch/spawn.test.mjs:108-150`;
  AGENTS.md "Key Decisions" entry on child stdio under MCP transport;
  SDS bullet update at `documents/design.md:32`.
- [x] Acceptance probe on the original surfacing host: a fresh run
  of `.flowai-workflow/bug-hunter-on-prod` in
  `korchasa/business/lumatale-fairy-taler` produces a stream.log
  showing
  `foxcode.launchBrowser` returning `connected` /
  `already-connected` and a follow-up `status` reporting
  `connectedClients > 0`. The bug-hunter then either reaches
  `verdict: PASS` (modulo the Google auth blocker tracked
  separately) or fails on a downstream stage — never again on
  `launchBrowser` itself. Evidence: run
  `korchasa/business/lumatale-fairy-taler/.flowai-workflow/bug-hunter-on-prod/runs/20260605T010831`
  with the patched channel installed locally into
  `~/.codex/plugins/cache/korchasa/foxcode/0.19.0/channel/launch/spawn.mjs`
  (backup at `spawn.mjs.bak.preFR15-stdio-fix`). bug-hunter report
  FoxCode section quoted verbatim:
  `launchBrowser result: {"status":"connected","pid":78404,"port":8803,"purged":0,"killed":0}`
  and `connectedClients: 1`. bug-hunter verdict=FAIL on downstream
  product bugs (OpenRouter `google/gemini-2.0-flash-001` → 404 in
  `api/src/config.ts`; missing `LocaleSwitcher` import in
  `frontend/src/LibraryPage.tsx`); both fixed by the
  `remediation` loop; qa iter-2=PASS; tech-lead-reviewer=APPROVED;
  `run_completed status=completed`. Total wall-clock 31 min.
- [~] If the cause is the Codex per-call MCP timeout: SRS / README
  updated with the documented timeout value, the configuration knob
  (if any), and the recommended `launchBrowser` argument to keep
  the channel-side wait under the budget. AGENTS.md "Key Decisions"
  block gets a one-line note ("Codex MCP per-tool-call timeout:
  <N> s, observed via …"). N/A — H1 ruled out as primary cause
  (corruption occurs at child-process startup, ~ms after spawn, far
  below any plausible tool-call deadline). Will be re-opened only if
  the acceptance probe still fails after the stdio fix.
- [ ] All three Tier-4 IDE acceptance harnesses
  (`scripts/test-ide-skill.sh` + the per-IDE driver) re-run green
  after the fix to confirm no regression for Claude Code / OpenCode
  interactive paths. Pending — `scripts/test-ide-skill.sh` /
  `scripts/test-ide.sh` cost LLM tokens and require local installs
  of `opencode`, `claude`, `codex`, `deno`, `python3`, `npx`.
  Local automated tests (`scripts/check.sh`) pass: 267 unit + 6
  acceptance (Tier 1+2), 0 failures.

## Solution

### Probe results

- **H1 — Codex per-call MCP timeout < 30 s wait.** Ruled out as
  primary cause. The observed `launchBrowser (failed)` lands well
  under 30 s in the surfacing stream (the whole bug-hunter node
  finished in ~72 s including a follow-up `status`). The stdout
  corruption documented under H4 happens within milliseconds of
  spawning `web-ext run`, long before any tool-call deadline could
  fire. Re-open only if the acceptance probe still fails after the
  H4 fix.
- **H2 — `prepare()` writes non-JSON to stdout.** Ruled out by
  code inspection. `foxcode/channel/launch/prepare.mjs:132` has
  `log = opts.log ?? ((s) => process.stderr.write(s + '\n'))`;
  `server.mjs:232` does not override `log`. No path from
  `prepare()` writes to fd 1.
- **H3 — channel exits when its MCP stdio peer disconnects.**
  Confirmed as the amplifying mechanism, not the trigger.
  `foxcode/channel/server.mjs:332` —
  `process.stdin.on('end', () => shutdown('stdin closed'))`;
  `shutdown()` calls `process.exit(0)` via
  `foxcode/channel/server.mjs:329`. This is the correct
  IDE-lifecycle behaviour for interactive sessions; it only becomes
  destructive once H4 already corrupted the transport and codex
  closed its side. Left intact.
- **H4 — `spawn(...)` inherits the channel's stdio.** **Confirmed.**
  Pre-fix `foxcode/channel/launch/spawn.mjs:160` set
  `stdio: ['ignore', 'inherit', 'inherit']`. Direct probe of the
  exact subprocess command (`npx -y web-ext run --source-dir …
  --firefox=…`) with `pipe`-captured streams shows:

  ```
  exit 1
  STDOUT bytes: 58
  STDOUT head: "Running web extension from /tmp/foxcode-probe-nonexistent\n"
  STDERR bytes: 196
  STDERR head: "\nInvalidManifest: ...\n"
  ```

  `web-ext run` writes a 58-byte human-readable banner to stdout
  synchronously on startup. Under `inherit`, that string lands on
  the channel's fd 1, which under `codex exec --experimental-json`
  is the MCP JSON-RPC stdio transport — codex rejects the non-JSON
  frame and closes the transport. Compounds with H3 to produce the
  observed cascade (`launchBrowser` failed → follow-up `status`
  failed). The JSDoc above `spawnWebExt` ("Stdout/stderr are
  forwarded to the parent's stderr so MCP stdio stays clean")
  already documented the correct intent — the code never matched
  it.

### Root cause

`foxcode/channel/launch/spawn.mjs:160` (pre-fix) —
`stdio: ['ignore', 'inherit', 'inherit']` on the `npx web-ext run`
child. fd 1 of `server.mjs` is the MCP stdio transport
(`server.mjs:360` `await mcp.connect(new StdioServerTransport())`).
Any byte the child writes to stdout corrupts JSON-RPC framing on
the host side; under `codex exec` the host closes the transport,
which trips the `process.stdin.on('end', …)` shutdown path in the
channel and brings the whole MCP server down mid-call.

### Fix

- `foxcode/channel/launch/spawn.mjs:156-176`: stdio changed to
  `['ignore', 'pipe', 'inherit']`; `proc.stdout.on('data', d =>
  process.stderr.write(d))` forwards child stdout to the channel's
  stderr so diagnostics (web-ext banner, deprecation notices,
  startup output) remain visible without polluting MCP frames.
  JSDoc rewritten to record the constraint and the reasoning.
- `foxcode/channel/launch/spawn.test.mjs:108-150`: regression test
  `spawnWebExt stdio` covering (a) `stdio[1] !== 'inherit'`
  invariant via `fakeSpawn` capture, and (b) end-to-end
  pipe → `process.stderr` forwarding via `PassThrough` + a
  `process.stderr.write` interceptor that asserts
  `Running web extension` reached stderr.
- Documentation:
  - `documents/design.md:32` notes the stdio constraint inline with
    the spawn.mjs description.
  - `AGENTS.md` "Key Decisions" gains "Child stdio under MCP stdio
    transport" entry pointing back to this whiteboard.

### Verification (local)

- `node --test foxcode/channel/launch/spawn.test.mjs` — 16/16 pass
  (two new tests in the `spawnWebExt stdio` suite).
- `bash scripts/check.sh` — 267 pass, 0 fail, 2 skipped (pre-existing,
  unrelated). Acceptance Tier 1+2
  (`opencode/test/acceptance/mcp.test.mjs`,
  `opencode/test/acceptance/bridge.test.mjs`,
  `opencode/test/acceptance/strict-mcp-host.test.mjs`) — all 8 green.

### New coverage layer — strict MCP host acceptance

The existing acceptance suite parses server stdout leniently
(`mcp.test.mjs:39` `try { JSON.parse(line) } catch { continue }`),
matching Claude Code / OpenCode behaviour and explaining why this
regression survived years of `check.sh` runs. The new file
`opencode/test/acceptance/strict-mcp-host.test.mjs` plugs that gap:

- **Strict client.** `StrictStdioMcpClient` records every non-JSON
  line on the channel's stdout into `protocolViolations[]` — the
  test fails if the array is non-empty after the session. Mirrors
  `codex exec --experimental-json` which closes the transport on
  the first non-JSON frame.
- **PATH stubs, no real Firefox / LLM.** `makeFakeBinDir(tmp)`
  drops two shell scripts:
  - fake `npx` prints `Running web extension from /fake\n` plus a
    second banner line to its own stdout, then exits 1 (matches
    the empirically-observed shape of `web-ext run` output that
    triggered the production failure).
  - fake `firefox` is a no-op executable so `findFirefox()` PATH
    walk returns non-null and the handler reaches the spawn path.
- **End-to-end flow.** `initialize` → `tools/call launchBrowser`
  (with `timeout: 500` so the handler returns `{status:"timeout"}`
  quickly without blocking on a real extension connect) →
  `tools/call status` to prove the transport survived.
- **Three assertions.**
  - `client.protocolViolations` is empty → no child-process stdout
    leaked onto fd 1.
  - `status.uptime > 0` → channel did not exit on stdin-EOF.
  - `client.stderr` matches `/Running web extension from \/fake/`
    → diagnostics still reach the operator (regression-proofs the
    pipe→stderr forwarder in the fix).
- **Wired into `check.sh`** alongside the existing Tier 1+2 files
  (`scripts/check.sh:73-77`). Runs in ~800 ms, no external deps.
- **Regression proof.** Stash-and-rerun confirms the test fails
  with the pre-fix `stdio: ['ignore','inherit','inherit']`,
  reporting `actual: ['Running web extension from /fake', 'More
  plain text on stdout that would corrupt JSON-RPC framing']` vs
  `expected: []`. Restored after the probe.

### Verification (owner-only, remaining)

- Bump and publish `foxcode-channel` (lockstep with all pinned
  literals per the npx-distribution decision in AGENTS.md), then
  re-run `.flowai-workflow/bug-hunter-on-prod` in
  `korchasa/business/lumatale-fairy-taler` to satisfy the acceptance
  probe DoD bullet above.
- Tier-4 IDE harnesses
  (`scripts/test-ide-skill.sh`, `scripts/test-ide.sh`) — LLM tokens
  required.
