---
date: "2026-06-06"
status: in progress
variant: "A — one browser per folder, many MCP servers, folder-scoped port discovery"
tags: [multi-session, launchbrowser, websocket, registry, project-profile]
related_tasks:
  - 2026/06/launchbrowser-closes-mcp-transport-under-codex-exec.md
  - 2026/06/move-browser-launch-to-mcp.md
---

# Multi-session: share one browser per folder, stop sessions breaking each other

## Goal

Allow N parallel MCP server sessions in the SAME project folder to coexist: they share ONE Firefox (Project Profile), and `evalInBrowser` from any session reaches that browser. Today a 2nd `launchBrowser` kills the 1st session's browser. Fix that without sacrificing folder isolation (a folder's browser must never connect to another folder's servers).

## Overview

### Context

Variant A selected (from chat variant analysis). Pain: two `server.mjs` in one folder cannot share a TCP port, so each binds a different port. The launcher is single-browser-per-folder with a destructive port-mismatch kill, so the later `launchBrowser` tears down the earlier browser. Even without the kill, a running browser would never learn the 2nd session's port — so removing the kill alone is insufficient.

Crux (must be solved): the single running browser must learn EVERY same-folder session's port. The browser cannot read files; it learns ports only from (a) tab URL hash, (b) saved `storage.local`, (c) a connected server telling it. Therefore discovery = a **folder-scoped registry file** that servers maintain, **relayed to the browser over the existing WS** of whichever server is already connected.

Rejected sub-mechanism: full port-range scanning by the extension. Password is machine-global (`~/.foxcode/password`) and the port range is shared, but each folder has its OWN browser/profile in Project Profile. Scanning would make folder X's browser connect to folder Y's servers → cross-folder bleed. Registry is folder-scoped (`<projectDir>/.foxcode/sessions.json`) → correct.

#### Alternatives considered (discovery mechanism)

Selection criterion under crashes: where coordination state lives — on disk (survives crash) vs in RAM (lost on crash). All variants share the same on-disk orphan-reap (F2); the choice is purely the discovery transport.

- **A1 — registry file + `siblings` in pong (SELECTED).** State on disk; recovery driven by next `launchBrowser` reading files, no live relayer required. Latency = ping interval (~5s). Least code, no extra failure surface under crashes.
- **A2 — registry file + `fs.watch` push.** Same on-disk recovery as A1, lower latency, BUT `fs.watch` dies with the process and drops events (esp. macOS FSEvents). Adds failure surface with no crash-recovery gain. Verdict: only as an A1 add-on (push + ping backstop) if 5s proves painful — NOT a replacement.
- **A4 — peer unix sockets + per-folder leader.** Membership lives in RAM of the leader → leader crash loses state → re-election + re-announce + split-brain risk; still needs on-disk reap for the orphan. Worst under crashes (max surface, zero recovery gain). Reserve ONLY for a future where the browser is detached from the owner session (then orphan is normal, not exceptional) — i.e. Variant B territory.
- **A6 — extension scan with folder-id tag.** Stateless discovery → crash-tolerant and covers the orphan-bootstrap case, BUT does not fix the lifecycle leak (reap still needed), and scans up to 100 ports periodically (noise) with brief foreign-folder connect/drop churn. Robust-but-noisy; not self-sufficient.

Decision: **A1** — best crash-resilience per line of code while the browser stays owner-bound (v1). Re-evaluate A2 (latency) and A4 (if browser is later detached).

### Current State (evidence)

- Extension holds N WS connections keyed by port: `foxcode/extension/background/background.js:24` (`sessions = Map`).
- Extension learns ports ONLY from tab hash + saved sessions; **no active scan**: `background.js:158-177` (`connect()`), `background.js:323-329` (`tabs.onUpdated`). Periodic ping exists only on connect/popup-open: `background.js:121-128,344-349`.
- Each server binds its own port; saved port machine-global, overwritten per session: `foxcode/channel/lib.mjs:145-165` (`createHttpServer`), `lib.mjs:96` (`PORT_FILE = ~/.foxcode/port`).
- Password machine-global, WS auth at upgrade via `?token=`: `foxcode/channel/server.mjs:60-64,93-104`.
- Destructive kill on port mismatch: `foxcode/channel/launch/spawn.mjs:137-143` (`handleExistingProcess`).
- Folder-shared pid file + profile (single-owner): `foxcode/channel/launch/tool.mjs:34-40,56-60,70-81`.
- pid file currently stores `browserPid\nport`: `spawn.mjs:58-73` (`writePidFile`/`readPidFile`). Plan extends format to also store `ownerPid` (the server pid) → enables orphan detection after owner crash.
- On HARD crash `shutdown()` (`server.mjs:317-330`) never runs → spawned `web-ext` group is NOT killed and keeps running (web-ext child does not auto-die with parent). This is the orphan source.
- `launchBrowser` short-circuits if THIS server already has a client: `tool.mjs:46-48` (`hasClients`).
- Browser process is a child group of the launcher; launcher kills it on shutdown: `server.mjs:317-330`, `tool.mjs:119-125` (`clearManaged` unlinks pid file).
- `buildPongMessage(env)` — no siblings field yet: `lib.mjs:66-82`.
- `.foxcode/` is gitignored: `.gitignore:16` (registry file safe from VCS; still keep secrets out of it).
- Tests to update: `spawn.test.mjs:172` (asserts kill-on-mismatch — behavior changes), `spawn.test.mjs:164` (match → reuse, stays), `tool.test.mjs:101-111` (already-running, stays).

### Constraints

- **Folder isolation**: a folder's browser connects ONLY to same-folder servers. Discovery state lives at `<projectDir>/.foxcode/sessions.json`.
- **No secret in registry**: store ports + pids only. Browser reuses the machine-global password it already holds from the owner's hash for sibling ports.
- **No destructive cross-session kill**: a healthy same-folder browser is reused, never killed, regardless of port.
- **No new heavy deps**: Node stdlib + existing `ws`/MCP SDK only. Extension stays MV2, no extra permissions.
- **Single source of truth**: channel code in `foxcode/channel/` only (published via npx). No fork.
- **TDD**: RED→GREEN→REFACTOR→CHECK per AGENTS.md. Behavior-change tests rewritten deliberately (spec change, not cheat).
- **Owner lifecycle (v1 accepted)**: browser lifetime tied to the session that spawned it (owner). Clean owner exit → `killProcessGroup` + pid file cleared (`server.mjs:317-330`, `tool.mjs:119-125`). Owner HARD crash (SIGKILL/OOM/segfault) → `shutdown()` never runs → browser orphaned but ALIVE; recovered by the ownerPid-reap rule (Failure Modes F2). A surviving/next session relaunches and becomes new owner.
- **Crash-resilient state on disk**: all coordination state (registry, pid file, launch lock) lives on disk so recovery survives any process crash; recovery is driven by the NEXT `launchBrowser` reading those files, not by any live process relaying. No coordination state held only in RAM.
- **stderr-only logging**: every new diagnostic goes to fd 2; nothing new writes fd 1 (MCP JSON-RPC transport). Registry = file; sibling advertisement = WS pong. Guards the codex-exec transport bug (see `2026/06/launchbrowser-closes-mcp-transport-under-codex-exec.md`).

### Discovery sequence (target)

```
S_owner start → register(port=8806) in .foxcode/sessions.json
launchBrowser(owner) → no pid → acquire launch.lock → spawn web-ext (start-url #8806) → browser connects 8806
S_b start → register(port=8807)
launchBrowser(S_b) → pid alive (owner) → NO kill → wait for own client
browser ⇄ S_owner: periodic ping → pong{siblings:[8807]} → browser connectToServer(8807, pw_from_owner)
browser connects 8807 → S_b.hasClients() → S_b.waitForClient resolves → launchBrowser(S_b)=already-running
evalInBrowser from S_owner OR S_b → both hit the one browser
```

## Failure Modes & Recovery

Crash-driven scenarios the design MUST survive (each recovery is on-disk-driven, not relay-dependent):

- **F1 — Non-owner MCP server crash.** WS drops → extension backoff then session removed (`background.js:130-136,182-199`). Registry entry pruned by pid-liveness on next read. No browser impact. Eval from other sessions unaffected.
- **F2 — Owner MCP server HARD crash (the critical one).** Browser orphaned but alive; pid file has `browserPid` alive, `ownerPid` dead. While ≥1 sibling stays connected, eval keeps working against the orphan. Recovery: the next `launchBrowser` reads pid file → `browserPid` alive AND `ownerPid` DEAD ⇒ confirmed orphan ⇒ REAP (`killProcessGroup(browserPid)` + unlink pid file) ⇒ spawn fresh, become new owner. Deterministic; needs NO live relay. This is the ONLY sanctioned kill (orphan-reap), distinct from the removed indiscriminate port-mismatch kill.
- **F3 — Firefox crash.** All WS drop. pid file `browserPid` now dead → next `launchBrowser` takes stale path → spawn fresh. Owner's `managed.pid` points to a dead pid → `killProcessGroup` is a harmless no-op.
- **F4 — Registry corrupt / partial write.** Atomic write (temp + `rename`) → readers never see partial. Read wrapped in try/catch → `[]` (fail-soft to empty). Server must NOT crash on bad JSON. Idempotent self re-register repopulates within one tick.
- **F5 — Registry write race (concurrent servers).** Read-merge-write may drop an entry. Each server re-registers itself idempotently on every pong tick ⇒ dropped entry reappears next tick (eventual consistency). No registry lock (avoids its own stale-lock failure).
- **F6 — Launch-lock holder crash.** `.foxcode/launch.lock` stores holder pid + mtime. On `EEXIST`: if holder pid dead OR mtime older than TTL (e.g. 60s) → unlink + retry once. No permanent deadlock.
- **F7 — Pid reuse.** Residual risk: a dead pid number reused by an unrelated process reads as alive. Mitigated by requiring BOTH `browserPid` alive AND `ownerPid` dead for the F2 reap (two independent pids colliding simultaneously is improbable). Documented residual; no `ps comm` validation in v1.
- **F8 — MCP fd1 pollution.** All new logs → stderr only. Registry is a file; sibling advertisement rides the WS pong. No new stdout writes. CI/grep guard: no `process.stdout`/`console.log` in new server code.
- **F9 — Extension reconnect churn.** Periodic ping only to OPEN sessions; connect only to advertised siblings NOT already in `sessions`; short "recently-failed" set to avoid immediately re-adding a just-failed port that the registry has not yet pruned; `MAX_RECONNECT_ATTEMPTS` bounds dead-port retries.
- **F10 — Same explicit `FOXCODE_PORT` for two parallel sessions.** 2nd fails to bind → `PORT == null` → `launchBrowser` returns clear error (`tool.mjs:52-54`). Document: do not share `FOXCODE_PORT` across parallel same-folder sessions.

## Definition of Done

- [x] 2nd `launchBrowser` in same folder does NOT kill the 1st browser; returns `already-running` and connects the new session's port to the existing browser within timeout. Evidence: `foxcode/channel/launch/spawn.mjs:163` (no mismatch kill, `reuse` verdict), `foxcode/channel/launch/tool.test.mjs` (`reuse verdict + own client connects → already-running, no spawn`), `foxcode/channel/launch/spawn.test.mjs` (`NEVER kills it (multi-session)`)
- [ ] `evalInBrowser` works from ≥2 concurrent same-folder sessions against ONE Firefox (verified with dev `.mcp.json` + plugin foxcode server simultaneously). Pending manual macOS run (no Firefox in CI env).
- [ ] A folder's browser never connects to another folder's server port (folder-scoped registry; manual 2-folder check). Pending manual macOS run.
- [x] Registry file contains ports + pids only — no password/secret. Evidence: `foxcode/channel/launch/registry.mjs`, `foxcode/channel/launch/registry.test.mjs` (`entries contain ports + pids only — no password/secret`)
- [x] Concurrent same-folder `launchBrowser` calls do not double-spawn (atomic launch lock); loser reuses the winner's browser. Evidence: `foxcode/channel/launch/tool.mjs:83` (`acquireLaunchLock`, rename-to-claim reclaim), `foxcode/channel/launch/tool.test.mjs` (`live launch.lock holder → loser does not spawn`)
- [x] Clean owner exit → pid file cleared → surviving session relaunches successfully (self-heal). Evidence: `foxcode/channel/server.mjs::shutdown` (unregister + killProcessGroup), `foxcode/channel/launch/tool.mjs::clearManaged`, `foxcode/channel/launch/spawn.test.mjs` (`clears stale PID file (browser dead) → verdict spawn`)
- [x] **Owner HARD crash (SIGKILL)** → next `launchBrowser` detects orphan (`browserPid` alive, `ownerPid` dead), reaps it, relaunches. No leaked Firefox, no profile-lock deadlock (F2). Evidence: `foxcode/channel/launch/spawn.mjs:177` (orphan reap), `foxcode/channel/launch/spawn.test.mjs` (`reaps an orphan (browser alive, owner dead) → kills group, verdict spawn`)
- [x] Corrupt/partial `sessions.json` → server starts, treats as empty, repopulates; never crashes (F4). Evidence: `foxcode/channel/launch/registry.test.mjs` (`readRegistry returns [] on corrupt/partial JSON`, `register on a corrupt registry treats it as empty`)
- [x] Stale `launch.lock` (dead holder) → next launch proceeds without deadlock (F6). Evidence: `foxcode/channel/launch/tool.test.mjs` (`stale launch.lock (dead holder) → proceeds to spawn`)
- [x] No new code writes fd 1 (stderr-only); grep/CI guard passes (F8). Evidence: grep scan of changed channel code shows only `process.stderr.write`; `scripts/check.sh` comment scan clean for changed files.
- [x] `scripts/check.sh` clean; `scripts/test.sh` green incl. new registry tests and rewritten spawn test. Evidence: `scripts/check.sh` → 288 unit + 8 acceptance pass, exit 0.
- [x] Docs updated: AGENTS.md Key Decisions, SRS (FR), SDS (registry component + sequence), README if public-facing. Evidence: `AGENTS.md` (2 new Key Decisions), `documents/requirements.md` FR-6, `documents/design.md` §3.1/§5/§6, `README.md`

## Solution

### Phase 0 — RED scaffolding
1. New test `foxcode/channel/launch/registry.test.mjs`: register/unregister round-trip; dead-pid prune; atomic write (temp+rename); concurrent writers eventual-consistency (self re-add survives, F5); corrupt/partial JSON → `[]` no throw (F4); `listLivePorts` excludes dead; no password field present.
2. Rewrite `spawn.test.mjs:172`: live `browserPid` on a different port + live `ownerPid` → verdict `reuse`, process NOT killed (removes old kill-on-mismatch). Keep `:164` (alive → reuse). Add: live `browserPid` + DEAD `ownerPid` → verdict `spawn`, browser group killed (F2 reap). Update pid round-trip `:62-72` for 3-line `ownerPid` format + legacy 2-line (`ownerPid:null`).
3. Add `tool.test.mjs` cases: (a) reuse-verdict + own client connects → `already-running`, no spawn; (b) orphan verdict (owner dead) → reap + spawn, becomes owner; (c) no pid + lock contention → loser does not spawn, resolves via waitForClient; (d) stale `launch.lock` (dead holder) → proceeds (F6); (e) dead browserPid → spawns (F3).

### Phase 1 — Server: folder-scoped registry
4. New `foxcode/channel/launch/registry.mjs`:
   - `registryPath(projectDir)` → `join(projectDir, '.foxcode', 'sessions.json')`.
   - `readRegistry(projectDir)` — try/catch; bad/missing/partial JSON → `[]` (fail-soft, F4). Never throws.
   - `register(projectDir, {port, pid})` — read, prune dead (`isProcessAlive`), upsert self, atomic write (write `*.tmp` + `rename`, F4). Idempotent → safe to call every tick (F5).
   - `unregister(projectDir, port)` — remove entry, atomic write. Best-effort (skip on crash).
   - `listLivePorts(projectDir)` — prune dead, return live ports.
   - Reuse `isProcessAlive` from `spawn.mjs` (export/import). Ports only — NO password in file.
5. `server.mjs`:
   - After PORT resolved: `register(resolveProjectDir(), {port: PORT, pid: process.pid})`.
   - In `handleExtensionMessage` ping→pong path: add `siblings: listLivePorts(projectDir).filter(p => p !== PORT)`.
   - In `shutdown()`: `unregister(projectDir, PORT)` before exit.
   - Wire registry fns into `createLaunchHandler` deps.
6. `lib.mjs`: extend `buildPongMessage(env)` to pass through `env.siblings` (default `[]`).

### Phase 2 — Server: non-destructive idempotent launch + crash-safe lock
7. `spawn.mjs` pid-file + existence logic (orphan-aware):
   - `writePidFile(path, browserPid, port, ownerPid)` → 3 lines; `readPidFile` → `{pid, port, ownerPid}` (back-compat: missing `ownerPid` ⇒ `null`). Update tests `spawn.test.mjs:62-72`.
   - `handleExistingProcess(pidFile)` returns a verdict, NO port-mismatch kill (remove `:137-143`):
     - `browserPid` dead → unlink → `{action:'spawn'}` (F3).
     - `browserPid` alive + `ownerPid` alive (or null=legacy) → `{action:'reuse', pid, port}`.
     - `browserPid` alive + `ownerPid` DEAD → orphan → `killProcessGroup(browserPid)` + unlink → `{action:'spawn'}` (F2 reap).
8. `tool.mjs` `doLaunch`:
   - Keep `hasClients()` → `already-connected`; keep per-process `inFlight` guard.
   - `handleExistingProcess`: `reuse` → `await waitForClient(timeout)` (relay/ping connects our port); connected → `already-running`; else `timeout`. `spawn` → go to lock step.
   - Acquire crash-safe launch lock `<projectDir>/.foxcode/launch.lock` via `writeFileSync(lock, ownerPid, {flag:'wx'})`. On `EEXIST`: read holder pid + file mtime; if holder dead OR mtime > TTL(60s) → unlink + retry once (F6); else treat as live.
     - Lock acquired → spawn (owner), `writePidFile(.., process.pid)`, `waitForClient`, release lock in `finally`.
     - Lock held (live) → another session spawning → `await waitForClient(timeout)`.
   - All diagnostics → stderr (F8).

### Phase 3 — Extension: learn sibling ports
9. `background.js`:
   - Add periodic ping per connected session: `setInterval` (5s) → `ws.send({type:'ping', paramsSource})` for each OPEN session. (MV2 persistent background — interval OK.)
   - In `handleChannelMessage` `pong`: read `msg.siblings` (ports). For each not in `sessions`, `connectToServer(port, session.password, 'sibling')` (reuse machine-global password from the connected session).
   - Include `siblings` handling on connect/popup pongs too (already pings there).

### Phase 4 — Docs + verify
10. AGENTS.md Key Decisions: replace single-browser-per-folder churn note with folder registry + pong-siblings discovery; document owner lifecycle.
11. SRS `documents/requirements.md`: FR for multi-session shared browser per folder + folder isolation acceptance.
12. SDS `documents/design.md`: registry component, pong `siblings` field, discovery sequence (mermaid), launch lock.
13. README: update multi-session note if user-facing.
14. Verify: `scripts/check.sh`, `scripts/test.sh`. Manual — run dev `.mcp.json` server + plugin foxcode server in same folder; `launchBrowser` from one, `evalInBrowser` from both; confirm one Firefox, both eval OK; kill owner → re-launch from survivor. Two-folder check: folder X browser never connects to folder Y port.

### Out of scope (deferred)
- Owner re-election / detached daemon browser surviving owner exit (Variant B territory).
- Per-folder port persistence (machine-global `~/.foxcode/port` thrash is cosmetic; not required for correctness).
