---
date: "2026-06-04"
status: in progress
implements: [FR-15, NF-1, NF-2, NF-7, NF-8, NF-9]
tags: [architecture, mcp, launch, project-profile, breaking-change]
related_tasks:
  - 2026/06/unify-mcp-distribution-via-npx.md
  - 2026/05/add-opencode-support.md
---

# Move Browser Launch into MCP Server

## Goal

Reduce moving parts of the Project Profile launch flow by hosting Firefox lifecycle (detect → preflight → spawn web-ext → PID/lifecycle → readiness check) inside the MCP channel instead of an external Python script driven by an IDE skill. Goal is fewer IDE-specific skill steps, fewer prerequisites on the user (no Python), and a uniform launch UX across Claude Code, OpenCode, Codex.

## Overview

### Context

- Today's launch flow (Project Profile) is layered:
  1. IDE-specific skill (`/foxcode:foxcode-run-project-profile` for CC; `.agents/skills/...` mirror for Codex; symlinked seeds for OpenCode) instructs the agent in user language.
  2. Skill calls MCP `status` to read authoritative `{port, password}`.
  3. Skill shells out to `python3 ${CLAUDE_SKILL_DIR}/scripts/launch_firefox.py --port X --password Y` (`foxcode/skills/foxcode-run-project-profile/scripts/launch_firefox.py:253-370`).
  4. Python script discovers Firefox + extension dir (`resolve_env.py`), prepares Firefox for launch by purging staged macOS update markers and SIGTERM-ing zombie `org.mozilla.updater` processes (`_prepare_firefox_for_launch` since commit `8ca9453`), spawns `npx web-ext run --source-dir <extDir> --firefox-profile .foxcode/firefox-profile --start-url 'http://localhost:PORT#PORT:PASS'` as a detached process, writes `.foxcode/web-ext.pid`, returns.
  5. Skill polls `status` until `connectedClients > 0` or surfaces a clear failure (restart vs. no-connect).
- User Profile mode is fundamentally manual (Load Temporary Add-on via `about:debugging`) and cannot move into MCP. So this task only affects Project Profile mode; the User Profile skill stays as is.
- The npx-distributed channel (`foxcode-channel@<pinned>`) is launched fresh per IDE session with no `cwd`/`env`. `process.cwd()` is the user's project dir — so the channel already has the context needed to write `.foxcode/web-ext.pid` and resolve `.foxcode/firefox-profile/`.
- `Codex plugin env vars (PLUGIN_ROOT / CLAUDE_PLUGIN_ROOT)`: MCP processes receive these env vars empty under Codex (`AGENTS.md` "Key Decisions"; codex issue #19372). Any logic inside MCP that needs the plugin payload (e.g. the extension dir) must NOT rely on those env vars — has to derive the path from the npm-distributed channel's own location or be passed via parameters.
- Discovery + preflight (`resolve_env.py`, `launch_firefox.py`) currently total ~600 LOC of Python with companion unit tests (`test_resolve_env.py`, `test_launch_firefox.py`). Moving into the channel means re-implementing this in Node and porting tests.
- The Firefox extension assets live inside the plugin payload (`foxcode/extension/`). The channel npm tarball today excludes the extension — only the channel package is published. So a channel-side launcher cannot reach the extension via its own filesystem; it would need the extension path passed in by the IDE skill OR a separate bundling decision (publish extension alongside channel, or fetch from plugin payload via env).

### Current State

- `foxcode/skills/foxcode-run-project-profile/SKILL.md`: 3-step skill (status → launch_firefox.py → poll status).
- `foxcode/skills/foxcode-run-project-profile/scripts/launch_firefox.py`: Python detached spawner, PID-file lifecycle, macOS update **preparation** (purge staged update markers + kill zombie `org.mozilla.updater` processes — never blocks; see `_prepare_firefox_for_launch`, `_purge_staged_firefox_updates`, `_kill_stale_foxcode_updaters` after commit `8ca9453`), port-change detection (kills stale Firefox), `--foreground` mode for `scripts/dev.sh`.
- `foxcode/skills/foxcode-run-project-profile/scripts/resolve_env.py`: cross-platform Firefox/extension discovery, `.foxcode/config.json` cache, OpenCode handoff file (`~/.foxcode/opencode-plugin-dir`) priority.
- `foxcode/channel/server.mjs`: today only exposes `status` + `evalInBrowser` tools. No launch concerns inside the MCP process.
- `.agents/skills/foxcode-run-project-profile/SKILL.md` (Codex) and OpenCode seeded skill both delegate to the same Python scripts via `${CLAUDE_SKILL_DIR}/scripts/...`.
- Tier-4 acceptance (`scripts/test-ide-skill.sh`, `opencode/test/acceptance/ide-task.test.ts`) drives the skill end-to-end across all three IDEs.

### Constraints

- **Skill stays as entry point** (Variant C): `/foxcode:foxcode-run-project-profile` keeps its role as the agent-facing canonical command and user-language UX, but its body collapses to two MCP tool calls (`status` + `launchBrowser`). The MCP-tool is exposed AND the skill is the documented way to use it — the agent learns the workflow through the skill, not via tool description alone.
- **Lifecycle tied to MCP process**: Firefox no longer survives MCP shutdown. On `SIGTERM`/`SIGINT`/stdin close the channel terminates the web-ext process group it spawned. Rationale: simpler invariants, no orphan Firefox after IDE crash; user-visible cost is that reconnecting an IDE re-launches Firefox.
- **`scripts/dev.sh --foreground` migrates to a CLI flag** of the channel binary (`foxcode-channel --launch-foreground`). Same supervising semantics, but Node-only — no Python, no separate launcher.
- **No backward compatibility**: foxcode-channel ≥ next major no longer works with the old Python-skill flow. The lockstep release flow updates the channel pin in CC plugin, OpenCode bundle, Codex marketplace + `.codex/config.toml` atomically, so end users on the latest IDE payload get the new flow in one bump. README ships a one-paragraph migration note (delete `~/.foxcode/`, re-run skill).
- **Extension bundling**: `foxcode/extension/` (120 KB) is packed into the `foxcode-channel` npm tarball. Channel resolves extension via `import.meta.url` → no env, no handoff files. IDE plugin payloads stop shipping `extension/`. Tarball grows ~50 KB compressed — negligible.
- **Extension discovery must not rely on `CLAUDE_PLUGIN_ROOT` or any IDE env** — verified empty under Codex (issue #19372).
- **Must preserve Firefox update preparation** — current Python semantics (commit `8ca9453`): purge `update.status`/`update.version`/`update.mar`/`Updated.app`/`active-update.xml` under `~/Library/Caches/Mozilla/updates/.../0/`, then SIGTERM any `org.mozilla.updater` whose argv holds our FoxCode URL, then launch unconditionally. No block-on-detect; no URL-secret redaction (the diagnostic path was removed). Print `Purged N` / `Killed N` summaries only when N > 0.
- **Cwd contract**: MCP child inherits the user's project dir as `process.cwd()` (already true under npx model — AGENTS.md). All project-local artifacts (`.foxcode/web-ext.pid`, `.foxcode/firefox-profile/`, `.foxcode/config.json`) resolve relative to cwd. No env-var indirection.
- **No new runtime dependency** beyond what `foxcode-channel` already has. `web-ext` is invoked via `npx web-ext` from within the channel (same as today); not a hard dependency in `package.json`.
- **User Profile skill untouched** — manual `about:debugging` mode cannot move into MCP.

## Definition of Done

Each item pairs (FR-ID, Test path or smoke-check, Evidence command). Tests are written RED in develop phase; the plan fixes WHERE.

- [x] FR-15: `launchBrowser` MCP tool exposed by channel; blocks until first WS connection or returns `{status:"timeout"}`. Test: `foxcode/channel/launch/tool.test.mjs::blocks until waitForClient resolves and returns status=connected`. Evidence: `node --test foxcode/channel/launch/tool.test.mjs`.
- [x] FR-15: Firefox process group dies on channel `SIGTERM`/`SIGINT`/stdin EOF. Test: `foxcode/channel/launch/spawn.test.mjs::killProcessGroup`. Evidence: `node --test foxcode/channel/launch/spawn.test.mjs`.
- [x] FR-15: Idempotency — concurrent calls share the in-flight promise; `already-connected` short-circuit when extension attached. Test: `foxcode/channel/launch/tool.test.mjs::idempotent — concurrent calls share the same in-flight promise`. Evidence: `node --test foxcode/channel/launch/tool.test.mjs`.
- [x] FR-15: macOS update preparation ported to Node — purges markers AND SIGTERMs `org.mozilla.updater` rows holding our FoxCode URL, always proceeds. Test: `foxcode/channel/launch/prepare.test.mjs::purgeStagedUpdates`/`killStaleFoxcodeUpdaters`/`prepareFirefoxForLaunch`. Evidence: `node --test foxcode/channel/launch/prepare.test.mjs`.
- [x] FR-15: Firefox binary discovery (macOS/Linux/Windows + PATH fallback) ported to Node. Test: `foxcode/channel/launch/discover.test.mjs::findFirefox`. Evidence: `node --test foxcode/channel/launch/discover.test.mjs`.
- [x] FR-15: Channel resolves bundled extension via `import.meta.url` — no env vars, no handoff files. Test: `foxcode/channel/launch/discover.test.mjs::findExtensionDir`. Evidence: `node --test foxcode/channel/launch/discover.test.mjs`.
- [x] FR-15: `foxcode-channel --launch-foreground` CLI flag enters supervised launch mode. Test: `--help` lists the flag; smoke `node server.mjs --help`. Evidence: `node foxcode/channel/server.mjs --help | grep launch-foreground`.
- [x] FR-15: SRS section `### 3.15 FR-15: Browser Launch via MCP` added with `**Acceptance:**` field. Test: manual — author. Evidence: `git diff documents/requirements.md`.
- [x] NF-1: CC plugin `.mcp.json` snippet unchanged in shape; CC plugin payload no longer ships `extension/`. Test: `scripts/codex-plugin-payload.test.mjs::payload does NOT ship channel/ or extension/ under unified-npx distribution`. Evidence: `node --test scripts/codex-plugin-payload.test.mjs`.
- [x] NF-2: Skill `/foxcode:foxcode-run-project-profile` collapses to two MCP calls (`status` + `launchBrowser`). Test: manual + acceptance `opencode/test/acceptance/mcp.test.mjs::channel exposes status, launchBrowser, evalInBrowser`. Evidence: `git diff foxcode/skills/foxcode-run-project-profile/SKILL.md`.
- [x] NF-7: OpenCode `prepack.mjs` stops copying `foxcode/extension/` into `bundle/extension/`; bundle ships only skills. Test: `opencode/test/pack.test.mjs::prepack assembles bundle/skills only`. Evidence: `node --test opencode/test/pack.test.mjs`.
- [x] NF-7: `~/.foxcode/opencode-plugin-dir` handoff file no longer written and no longer consumed (deleted code path). Test: `opencode/lib/setup.test.mjs::runSetup seeds skills…no handoff file` + `opencode/test/plugin.test.mjs::bootstrap seeds skills…writes no handoff file`. Evidence: `node --test opencode/lib/setup.test.mjs opencode/test/plugin.test.mjs`.
- [x] NF-8: `scripts/build-plugin-payload.mjs` strips `extension/` from Codex marketplace payload. Test: `scripts/codex-plugin-payload.test.mjs`. Evidence: `node --test scripts/codex-plugin-payload.test.mjs`.
- [x] NF-9: SRS section 4.9 (Self-Contained Plugin Payload) updated — plugin payload self-containment now satisfied by the channel npm package. Test: manual — author. Evidence: `git diff documents/requirements.md`.
- [x] Removed code: `launch_firefox.py`, `resolve_env.py`, and their `test_*.py` companions; skill scripts dir deleted. Test: manual — author. Evidence: `git diff --name-only --diff-filter=D | grep foxcode/skills/.*scripts`.
- [ ] Lockstep release: `auto-release` bumps `foxcode-channel` literal across files. Deferred — CI's `auto-release` handles the version bump on push to main; not performed by hand (per `.claude/rules/version-files.md`). Test: existing `scripts/release-sh.test.mjs` covers lockstep edit shape. Evidence: `node --test scripts/release-sh.test.mjs`.
- [x] SDS §3.1 (Channel Plugin) updated: `launchBrowser` tool documented; extension distribution section rewritten. Test: manual — author. Evidence: `git diff documents/design.md`.
- [x] README migration note: single paragraph added for the 0.18→0.19 cutover. Test: manual — author. Evidence: `git diff README.md`.
- [x] FR-15: Multi-session safety — `handleExistingProcess` detects the live PID file and returns `already-running` cross-process. Test: `foxcode/channel/launch/spawn.test.mjs::handleExistingProcess` + `foxcode/channel/launch/tool.test.mjs::returns already-running when PID file exists and existing process is alive on same port`. Evidence: `node --test foxcode/channel/launch/spawn.test.mjs foxcode/channel/launch/tool.test.mjs`.
- [x] FR-15: `launchBrowser` does NOT block other MCP requests. Handled by the MCP SDK — each request handler runs independently; `inFlight` only dedups concurrent `launchBrowser` calls. Test: implicit via acceptance `opencode/test/acceptance/mcp.test.mjs::channel exposes status, launchBrowser, evalInBrowser tools` (both tools listed and dispatchable). Evidence: `node --test opencode/test/acceptance/mcp.test.mjs`.
- [x] FR-15: macOS update preparation — 5 cases (full purge, lone marker, idempotent no-op on clean cache, kill-on-match, ignore-non-matching, port-less skip). Test: `foxcode/channel/launch/prepare.test.mjs`. Evidence: `node --test foxcode/channel/launch/prepare.test.mjs`.
- [ ] Bundle drift guard — `foxcode/channel/extension/` exists only during `npm pack`. Deferred — `foxcode/channel/extension/` is gitignored (`.gitignore` entry); `scripts/check.sh` comment-scan catches any committed test artifact under `foxcode/extension/`. Standalone drift-guard script not added.
- [ ] Release dry-run on `0.19.0` — `scripts/release.sh --dry-run` exits 0 and prints lockstep edits. Deferred — existing `scripts/release-sh.test.mjs` covers the lockstep edit shape; no additional script tests added.
- [x] Known UX regression documented — README migration paragraph states "the launched Firefox is tied to the MCP process, so closing the IDE … now closes Firefox with it". Test: manual — author. Evidence: `git diff README.md`.

## Solution

### Architecture changes

- **Channel package layout (new):**

  ```
  foxcode/channel/
  ├── server.mjs           # adds launchBrowser handler + lifecycle wiring
  ├── lib.mjs              # +TOOL_DEFINITIONS entry for launchBrowser
  ├── launch/              # NEW: ported from Python
  │   ├── discover.mjs     # findFirefox(platform) + findExtension(import.meta.url)
  │   ├── prepare.mjs      # macOS update preparation: purge markers + kill zombie updater (never blocks)
  │   ├── spawn.mjs        # web-ext spawn, process group, PID file, port-change kill
  │   └── foreground.mjs   # --launch-foreground CLI supervisor
  ├── extension/           # NEW: copied at publish time from ../extension/ via prepack
  │   ├── manifest.json
  │   ├── background/
  │   ├── popup/
  │   ├── content/
  │   └── icons/
  └── package.json         # files: ["*.mjs", "extension/", "launch/"]
  ```

- **`foxcode-channel` publish step (new `foxcode/channel/prepack.mjs`):**
  - Copy `../extension/` into `./extension/` immediately before `npm pack`. Same idempotent copy pattern as `opencode/prepack.mjs`.
  - Excludes: `node_modules/`, `.foxcode/`, `*.test.*`, `.DS_Store`.

### New MCP tool `launchBrowser`

- Schema (`foxcode/channel/lib.mjs` TOOL_DEFINITIONS):
  ```js
  {
    name: 'launchBrowser',
    description: 'Launch Firefox with the FoxCode extension. Blocks until the extension connects (or times out). Idempotent — returns already-running if a managed Firefox is alive.',
    inputSchema: {
      type: 'object',
      properties: {
        timeout: { type: 'number', default: 30000, description: 'Max ms to wait for extension connection.' },
        headless: { type: 'boolean', default: false },
      },
    },
  }
  ```
- Handler in `server.mjs`:
  1. Check `hasClients()` — if true, return `{status: 'already-connected'}`.
  2. Check `.foxcode/web-ext.pid` — if alive on same port, return `{status: 'already-running'}`.
  3. Prepare Firefox (`launch/prepare.mjs`): purge staged update markers, kill zombie updaters holding our URL. Never blocks; logs counts to stderr.
  4. Resolve Firefox + extension paths (`launch/discover.mjs`).
  5. Spawn `npx web-ext run --source-dir <ext> --firefox-profile .foxcode/firefox-profile --keep-profile-changes --firefox=<bin> <update-prefs> --start-url 'http://localhost:PORT#PORT:PASS'` as a tracked subprocess (not detached). Save group PID to `.foxcode/web-ext.pid`.
  6. `await new Promise(resolve => { /* resolve when wss "connection" event fires OR timeout */ })`.
  7. Return `{status: 'connected', pid, port, purged?, killed?}` or `{status: 'timeout', reason: 'no extension connect'}`.

### Lifecycle wiring (channel shutdown)

- Extend existing `shutdown(reason)` in `server.mjs`:
  ```js
  function shutdown(reason) {
    process.stderr.write(`foxcode: shutdown (${reason})\n`)
    killManagedFirefox()  // SIGTERM whole process group; SIGKILL after 2s grace
    for (const ws of clients) ws.terminate()
    if (httpServer) { wss.close(); httpServer.close() }
    process.exit(0)
  }
  ```
- `killManagedFirefox()` reads `.foxcode/web-ext.pid`, kills process group, deletes file. Mirrors current Python `_kill_process` semantics. Behaves as no-op when PID file absent or PID stale.

### Extension path resolution

- One function in `launch/discover.mjs`:
  ```js
  import { fileURLToPath } from 'node:url'
  import { dirname, join } from 'node:path'
  export function findExtensionDir() {
    return join(dirname(fileURLToPath(import.meta.url)), '..', 'extension')
  }
  ```
- Asserts `manifest.json` exists at that path; otherwise throws (fail-fast). No fallbacks — bundled or bust.

### Firefox binary discovery

- Port `KNOWN_FIREFOX_PATHS` + PATH lookup from `resolve_env.py` into `launch/discover.mjs::findFirefox()`. Same per-platform candidate list.
- Tests cover each platform via fakefs/path mocking, mirroring `test_resolve_env.py`.

### Firefox update preparation (`launch/prepare.mjs`)

Direct Node port of Python `_prepare_firefox_for_launch(home, port)` from commit `8ca9453`. Semantics: never blocks. Three exported functions:

- `purgeStagedUpdates(home)` — removes `update.status` / `update.version` / `update.mar` / `active-update.xml` files plus `Updated.app` dirs under `~/Library/Caches/Mozilla/updates/`. Returns absolute paths removed.
- `killStaleFoxcodeUpdaters(port)` — `ps -axo pid=,comm=,args=` then SIGTERM rows whose argv contains both `org.mozilla.updater` AND `http://localhost:<port>`. Skips on `port == null` or Windows. Returns killed PIDs.
- `prepareFirefoxForLaunch(home, port)` — calls both, logs `foxcode: purged N` / `foxcode: killed N` only when N > 0.

Notes:

- Linux/Windows paths are not in scope — the staged-update bug is macOS-specific (Python original short-circuits on Windows for the `ps` step). On non-macOS the cache root does not exist → empty return. No-op preserved.
- No URL-secret redaction — Python `_sanitize_process_line` was removed in `8ca9453` because the only consumer was the now-deleted error path. We mirror that: log **counts**, never raw `ps` lines.
- The `--pref=app.update.*=false` flags in the web-ext command line continue to prevent re-staging during the launched session.

### `scripts/dev.sh` migration

- Replace `python3 .../launch_firefox.py --foreground` with `npx -y foxcode-channel@latest --launch-foreground` (local dev: `node foxcode/channel/server.mjs --launch-foreground`).
- The CLI flag enters a supervisor mode that does the same work as `launchBrowser`, but blocks the process so Ctrl-C kills both channel and Firefox.

### Skill rewrite

`foxcode/skills/foxcode-run-project-profile/SKILL.md` becomes 2 steps:

```
1. Call status; if connectedClients > 0 → "Ready." stop.
2. Call launchBrowser; on success → "Ready."; on timeout → relay structured error.
```

Codex mirror (`.agents/skills/foxcode-run-project-profile/SKILL.md`) and OpenCode-seeded version use the same body. No script paths anywhere.

### Distribution payload changes

- **CC plugin** (`foxcode/`): `.mcp.json` unchanged (already `npx -y foxcode-channel@<pinned>`); plugin payload drops `foxcode/extension/`. Updates `marketplace.json` if extension was referenced.
- **OpenCode** (`opencode/prepack.mjs`): drop `foxcode/extension/` copy step; bundle ships only skills. Remove `~/.foxcode/opencode-plugin-dir` handoff write in `index.mjs`.
- **Codex** (`scripts/build-plugin-payload.mjs`): payload = skills only. `.codex/config.toml` already points to npx.
- All three IDE payloads converge to: skills + MCP snippet pointing to npx.

### Release flow

- `scripts/release.sh` and `.github/workflows/ci.yml::auto-release` already bump every literal in lockstep. Add to the script:
  - Trigger `foxcode/channel/prepack.mjs` before `npm publish`.
  - Post-publish sanity: `npm view foxcode-channel@<ver> dist.tarball` → fetch → verify `extension/manifest.json` is inside.
- Mark the release as a major bump (no SemVer-prerelease loop): `0.18.x → 0.19.0` (or `→ 1.0.0` if breaking-change policy says so).

### Files to create

- `foxcode/channel/launch/discover.mjs`
- `foxcode/channel/launch/prepare.mjs`
- `foxcode/channel/launch/spawn.mjs`
- `foxcode/channel/launch/foreground.mjs`
- `foxcode/channel/launch-tool.test.mjs`
- `foxcode/channel/launch-lifecycle.test.mjs`
- `foxcode/channel/update-prepare.test.mjs`
- `foxcode/channel/firefox-discovery.test.mjs`
- `foxcode/channel/extension-resolve.test.mjs`
- `foxcode/channel/cli-flags.test.mjs`
- `foxcode/channel/prepack.mjs`
- `scripts/test-no-python-in-skill.sh`
- `scripts/test-channel-bundle-drift.sh`
- `scripts/release-dry-run.test.mjs`

### Files to modify

- `foxcode/channel/server.mjs` — add tool handler, wire `killManagedFirefox`.
- `foxcode/channel/lib.mjs` — extend `TOOL_DEFINITIONS`.
- `foxcode/channel/package.json` — `files: ["*.mjs", "extension/", "launch/"]`, bin entry.
- `foxcode/skills/foxcode-run-project-profile/SKILL.md` — collapse to 2 steps.
- `.agents/skills/foxcode-run-project-profile/SKILL.md` — same body.
- `opencode/prepack.mjs` — drop extension copy.
- `opencode/index.mjs` — drop handoff write.
- `opencode/lib/foxcode-mcp-entry.mjs` — bump pin literal (release-time).
- `scripts/build-plugin-payload.mjs` — drop extension copy.
- `scripts/dev.sh` — switch to `--launch-foreground`.
- `scripts/release.sh`, `.github/workflows/ci.yml` — add prepack + post-publish tarball check.
- `documents/requirements.md` — add `### 3.15 FR-15`; rewrite NF-9; add `**Tasks:**` back-pointer to NF-1, NF-2, NF-7, NF-8, NF-9.
- `documents/design.md` — §3.1 (Channel Plugin) gains launchBrowser tool + extension; §8 (Distribution & Setup) rewrites bundling story.
- `README.md` — one-paragraph migration note.

### Files to delete

- `foxcode/skills/foxcode-run-project-profile/scripts/launch_firefox.py`
- `foxcode/skills/foxcode-run-project-profile/scripts/test_launch_firefox.py`
- `foxcode/skills/foxcode-run-project-profile/scripts/resolve_env.py`
- `foxcode/skills/foxcode-run-project-profile/scripts/test_resolve_env.py`
- `foxcode/skills/foxcode-run-project-profile/scripts/` (entire dir if empty)
- `foxcode/extension/` (now lives only in repo source; channel prepack copies it)

### Implementation sequence (RED→GREEN→REFACTOR per AGENTS.md TDD)

1. **Foundation**: add `launch/discover.mjs::findExtensionDir` + bundling via `prepack.mjs`. Tests first. Update `foxcode/channel/package.json` `files:` list.
2. **Discovery**: port `findFirefox` from Python. Tests first.
3. **Update preparation**: port macOS update purge + zombie-updater kill (`launch/prepare.mjs`). Tests first — 5 cases mirroring Python `TestFirefoxUpdatePreparation`. Behavior is "always proceed", never block.
4. **Spawn**: implement `launch/spawn.mjs` with process group + PID file. Tests first.
5. **Tool**: wire `launchBrowser` handler in `server.mjs`. Tests first (mock WS connection).
6. **Shutdown lifecycle**: extend `shutdown()` to kill Firefox. Tests first.
7. **CLI**: add `--launch-foreground`. Test exit-signal behavior.
8. **Skills**: collapse SKILL.md to 2 steps; remove script references in CC + Codex mirrors.
9. **Distribution**: strip extension from OpenCode `prepack.mjs` + Codex `build-plugin-payload.mjs` + CC marketplace.
10. **Docs**: add FR-15 to SRS, rewrite NF-9, update SDS, README migration note.
11. **Release**: bump version in lockstep, run dry-run release, verify tarball contains extension.
12. **Delete Python**: only after Tier-4 acceptance passes end-to-end across all three IDEs.

### Verification commands

- Unit + integration: `bash scripts/check.sh && bash scripts/test.sh && npm --prefix foxcode/channel test`
- Tarball sanity: `cd foxcode/channel && node prepack.mjs && npm pack --dry-run | grep extension/manifest.json`
- Tier-4 IDE acceptance: `bash scripts/test-ide-skill.sh && npm --prefix opencode run test:e2e`
- No Python remaining: `find foxcode .agents -name '*.py' | wc -l` → `0`
- Release dry-run: `bash scripts/release.sh --dry-run`
- Live smoke (manual on macOS): start IDE → `/foxcode:foxcode-run-project-profile` → expect Firefox window + agent reports "Ready" → `evalInBrowser({code:'return await navigate("https://example.com")'})` round-trips → kill IDE → expect Firefox window closes.

### Follow-ups (deferred)

- User Profile flow currently uses the same Python script tree for extension discovery. Once Project Profile is fully ported, audit whether User Profile skill still needs any Python (it should not — it only auto-opens `about:debugging` URL).
- Consider exposing `closeBrowser` MCP tool for explicit teardown without IDE shutdown.
- UX regression on IDE-restart (Firefox dies with channel) — measure user pain before deciding whether to expose a "detached" flag on `launchBrowser` that opts back into the old survive-restart behavior. Out of scope for this task because user explicitly chose the simpler lifecycle.
- Codex MCP startup timing — the first `npx web-ext` invocation can take ~5–10s while npm fetches `web-ext`. Already observed under the current Python flow, so not a regression, but worth a future optimization (pre-warm cache during channel install, or vendor `web-ext` as a peer dep).
