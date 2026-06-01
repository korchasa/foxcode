---
date: "2026-06-02"
status: to do
implements: [NF-7, NF-8]
tags: [distribution, packaging, mcp, npx, claude-code, codex, opencode]
supersedes:
  - 2026/05/distribute-channel-via-npm.md
  - 2026/05/codex-plugin-marketplace-payload.md
related_tasks:
  - 2026/05/add-opencode-support.md
---

# Unify MCP server distribution across IDEs via `npx foxcode-channel`

## Goal

Single distribution channel for the MCP server across **all** supported IDEs (Claude Code, Codex, OpenCode): `command = "npx"`, `args = ["-y", "foxcode-channel@<pinned>"]`. The marketplace/plugin payload ships only static assets (skills + Firefox extension + the npx-pointing MCP snippet). The executable channel lives in one place — the unscoped `foxcode-channel` npm package — and is fetched/cached by `npx` on first launch per machine.

Eliminates three classes of fragility at once:
1. Broken-nvm `npm ci` inside the CC plugin cache.
2. Codex MCP loader's refusal to expand `${CLAUDE_PLUGIN_ROOT}` / set plugin env vars.
3. Drift between repo and user-edited `~/.codex/config.toml` MCP snippets.

Replaces the two previously parallel directions: per-IDE bundled-source (`codex-plugin-marketplace-payload`) and OpenCode-bundled-channel-only (the OpenCode carve-out in `distribute-channel-via-npm`).

## Overview

### Context

Three IDEs run the channel today via three different mechanisms:

- **Claude Code plugin** — currently working-tree state: `npx -y foxcode-channel@0.4.2` (uncommitted, see `foxcode/.mcp.json`). Previous shape: `sh -c "...npm ci...node server.mjs"` rooted at `${CLAUDE_PLUGIN_ROOT}/channel`.
- **Codex** — repo-scoped dev only via `.codex/config.toml`. No working marketplace install. The blocker documented in `codex-plugin-marketplace-payload.md` (Codex MCP loader does not expand `${CLAUDE_PLUGIN_ROOT}` and exposes no plugin env vars to MCP processes) is **bypassed entirely** by npx — npx needs neither plugin root nor plugin env vars.
- **OpenCode plugin** — bundles `foxcode/channel/` into `bundle/channel/` at prepack time, launches `node bundle/channel/server.mjs` by absolute path. `@korchasa/foxcode-opencode` is therefore a heavy bundle (extension + channel + skills). Migrating to npx splits responsibilities: the OpenCode plugin becomes a thin installer (skills + extension) and emits an npx-shaped MCP snippet identical to CC/Codex.

The npm package `foxcode-channel` is already published (versions 0.1.0 … 0.4.2 under maintainer `korchasa`). The current working tree reflects the rename from scoped (`@korchasa/foxcode-channel@0.17.1` per commits `38b423b`, `8dc87ae`) to unscoped (`foxcode-channel@0.4.2`).

The launch skills (`foxcode-run-project-profile`, `foxcode-run-user-profile`) resolve the bundled Firefox extension via their own location (`SKILL.md` path → plugin root → `extension/`). The channel itself never reads from `${CLAUDE_PLUGIN_ROOT}/extension`. This is what makes the npx model viable: the channel is a pure WebSocket↔MCP bridge that needs only `process.cwd()` (the user's project dir) — nothing else from the plugin payload.

### Current State

- `foxcode/channel/package.json`: unscoped `foxcode-channel@0.4.2`. Working-tree edit, not committed.
- `foxcode/.mcp.json` (CC plugin): `command="npx"`, `args=["-y", "foxcode-channel@0.4.2"]`. Working-tree edit, not committed.
- `opencode/package.json`: `@korchasa/foxcode-opencode@0.16.4`. `opencode/index.mjs` still emits an absolute-path MCP snippet pointing at `bundle/channel/server.mjs`. `opencode/prepack.mjs` still copies `foxcode/channel/` into `bundle/channel/`.
- `.codex/config.toml`: repo-scoped MCP entry that `sh -c …`'s into `foxcode/channel`.
- `~/.codex/config.toml` (per user, undocumented to most installs): hand-rolled `[mcp_servers.foxcode]` block with version-agnostic glob over `~/.codex/plugins/cache/korchasa/foxcode/<ver>/channel`. Recorded as a Key Decision in `AGENTS.md` line 131 — to be replaced.
- `plugin-src/{claude,codex,shared}/` and `scripts/build-plugin-payload.mjs`: scaffolding from the now-superseded `codex-plugin-marketplace-payload` direction. Working tree, not committed. Action: re-scope as build-time generator for the unified npx-based payload (Codex `.codex-plugin/plugin.json` and CC `foxcode/.mcp.json` written from one source) — see Step 4.
- `scripts/codex-{env-probe-mcp,plugin-install,plugin-mcp,plugin-payload}.test.mjs`: empirical probes. Useful as-is for verifying Codex behaviour under npx (Step 5 acceptance).
- `foxcode-channel` on npm: published, owned by `korchasa`, latest 0.4.2. Next release goes here.

### Constraints

- **One source of truth for channel code.** `foxcode/channel/{server.mjs,lib.mjs,validator.mjs}` is the only place. npm publishes from this folder. No code fork.
- **Release lockstep.** `npm publish foxcode-channel@X.Y.Z` MUST succeed before tagging `foxcode@X.Y.Z` and before marketplace pointer update. Pinned literals in `foxcode/.mcp.json`, `plugin-src/codex/.../mcp.json`, and the OpenCode-emitted snippet bump together. Out-of-order release = broken install for early upgraders. Enforced by `scripts/release.sh` (already wired for the unscoped name in working tree).
- **Pin exact version.** No caret, no `latest`. An upgraded channel cannot silently propagate to users on an older plugin version (NF-1 contract).
- **`process.cwd()` as project-dir default.** Already implemented (`resolveProjectDir` in `foxcode/channel/lib.mjs`, DoD `[x]` in superseded `distribute-channel-via-npm.md` line 57). `FOXCODE_PROJECT_DIR` env var stays as an explicit override; channel does not depend on it.
- **No `cwd` field in any plugin `.mcp.json` snippet.** Setting `cwd = "."` under Codex forces the channel's cwd to the plugin cache root, breaking `process.cwd()` as project-dir source. Absence of `cwd` lets all three IDEs pass the user's project dir through naturally (verified for CC; to be verified for Codex plugin install — Step 5).
- **No regression for existing users.**
  - CC users on `foxcode@0.17.0` and earlier keep working until they upgrade (their installed plugin's `.mcp.json` is unchanged; new shape ships in the next plugin release).
  - OpenCode users on `@korchasa/foxcode-opencode@0.16.4` and earlier keep working until they upgrade (bundled-channel path stays runnable; new release stops bundling).
  - Codex users with hand-rolled `~/.codex/config.toml` snippets get a one-line migration note pointing at the new shape.
- **Network dependency on first launch per machine.** Acceptable per project rule "fail fast, fail clearly". `npx` prints its own stderr on registry unreachable. No project-side fallback. Documented in README.
- **Self-host friendliness.** Private npm registries (`.npmrc`-driven) work without project changes; `npx` honours `.npmrc`.

### Problem Statement

After the Codex plugin marketplace investigation (see superseded `codex-plugin-marketplace-payload.md` § Investigation Evidence), two empirical facts pin the design:

1. **Codex MCP loader does not expand `${…}` placeholders** in `command`/`args`/`env`. Only relative `cwd` is normalised to plugin root. So any plugin-shipped MCP config that needs to point at bundled source must use a Codex-specific trick (relative entry + `cwd = "."`), and that trick breaks project-dir resolution.
2. **Codex does not pass plugin env vars** (`PLUGIN_ROOT`, `CLAUDE_PLUGIN_ROOT`, …) to MCP child processes. Hooks get them; MCP processes do not. MCP roots capability is not advertised either.

For a source-bundled MCP server these constraints force a choice between «MCP can find its own source» and «MCP can see user project dir». npx sidesteps both: the executable is resolved from `~/.npm/_npx` (no plugin root needed), and the child inherits user cwd (no env-var injection needed). The only thing the marketplace payload must carry is the **`.mcp.json` snippet that names the npx command** plus skills and extension.

This unifies CC, Codex, and OpenCode behind a single launch contract.

### Investigation Evidence

(Carried over from superseded tasks — all still relevant.)

- `codex-cli 0.133.0` plugin install path verified: marketplace add + plugin add succeed in isolated `CODEX_HOME`.
- Codex MCP process probe (`scripts/codex-env-probe-mcp.mjs`): cwd = plugin cache root **when `cwd = "."` is set**; cwd = null otherwise (relative entry resolution then fails). All `PLUGIN_*` / `CLAUDE_PLUGIN_*` / `CODEX_HOME` env vars absent in MCP process env.
- `codex-rs/core-plugins/src/loader.rs::normalize_plugin_mcp_server_value` — confirmed source-level: only `type`, `oauth.clientId → client_id`, and relative `cwd` are normalised. No string expansion of `command`/`args`/`env`.
- `foxcode-channel@0.4.2` published on npm (verified `npm view foxcode-channel`). Maintainer `korchasa`.
- `scripts/test-npx-channel.sh` already runs `npx -y foxcode-channel@<ver> --version` in isolated `HOME`/`npm_config_cache` and returns exit 0 (run via `FOXCODE_SMOKE=1 bash scripts/check.sh`).
- `foxcode/channel/lib.mjs::resolveProjectDir` returns `FOXCODE_PROJECT_DIR` if non-empty else `process.cwd()`. Test coverage in `foxcode/channel/lib.test.mjs:225-255`.

### Open Questions (empirical — resolve before merging)

Q1. **Codex plugin MCP launch with `command="npx"` and no `cwd`.** Does Codex preserve the user-session cwd in the MCP child? If yes → `process.cwd()` in channel is the user's project dir, model works. If Codex forces cwd to plugin root or null, an explicit `FOXCODE_PROJECT_DIR={env:PWD}`-style hint is needed — but Codex does not interpolate env at MCP launch (per loader.rs). Then the fallback is a `SessionStart` hook writing project-dir state to `~/.foxcode/codex-project-dir` for the channel to read at first tool call.

Q2. **Codex `.codex-plugin/plugin.json` MCP wiring with `command="npx"`.** Does Codex install the plugin's MCP config into the user's effective MCP list, so `codex mcp list` shows `foxcode … ✓ Connected` after `codex plugin add foxcode@korchasa` without any `~/.codex/config.toml` edit? `codex-plugin-marketplace-payload.md` confirms install succeeds; only the bundled-source launch is broken. The npx variant should remove that breakage.

Q3. **OpenCode `opencode.json` MCP snippet with `command="npx"`.** Existing snippet uses absolute path. Verify OpenCode accepts plain `command="npx", args=["-y", "foxcode-channel@<ver>"]` without `cwd`, and that `FOXCODE_PROJECT_DIR` is not required (channel's `process.cwd()` default suffices).

Q4. **CC plugin running `command="npx"` against an unpublished pinned version.** Already proven manually for working-tree `foxcode-channel@0.4.2` (published). DoD requires same for the next bump (released as part of this task).

## Definition of Done

Each item: criterion — test / evidence command. Empirical (Q1–Q4) items resolved with positive evidence; negative resolutions trigger fallback design and a re-scope of this task.

- [ ] NF-7 / NF-8 — `foxcode/.mcp.json` (CC plugin) uses `{ "command": "npx", "args": ["-y", "foxcode-channel@<pinned>"] }` with no `cwd` and no `env`. Evidence: `cat foxcode/.mcp.json`; `claude plugin validate .` exits 0.
- [ ] NF-8 — Codex plugin payload exists under `plugin-src/codex/` with `.agents/plugins/marketplace.json`, `.codex-plugin/plugin.json`, and a Codex-shaped `.mcp.json` whose `mcpServers.foxcode = { command: "npx", args: ["-y", "foxcode-channel@<pinned>"] }`. Evidence: `node --test scripts/codex-plugin-payload.test.mjs`.
- [ ] NF-8 — `codex plugin marketplace add` + `codex plugin add foxcode@korchasa` against the built payload succeeds in an isolated `CODEX_HOME`. Evidence: `node --test scripts/codex-plugin-install.test.mjs`.
- [ ] NF-8 — installed Codex plugin's MCP server starts via npx and `codex mcp list` shows `foxcode … ✓ Connected` without any user-edited `~/.codex/config.toml`. Test: `scripts/codex-plugin-mcp.test.mjs::installed codex mcp tools list`. Evidence: `node --test scripts/codex-plugin-mcp.test.mjs`.
- [ ] NF-8 — channel running under Codex plugin install reports the **user's project directory** (not plugin cache) for `status`. Q1 resolved positively, or fallback (SessionStart hook writing `~/.foxcode/codex-project-dir`) implemented and tested. Evidence: probe via `mcp__plugin_foxcode_foxcode__status` from an isolated session, asserts `projectDir == $PWD`.
- [ ] NF-7 — OpenCode plugin (`@korchasa/foxcode-opencode`) emits an npx-shaped MCP snippet on `session.created` and CLI `setup --write-config`. `bundle/channel/` is no longer copied at prepack; bundle ships skills + extension only. Evidence: `cd opencode && npm pack --dry-run` shows no `bundle/channel/`; `opencode/test/plugin.test.mjs` and `opencode/test/cli.test.mjs` pass after asserting the new snippet shape.
- [ ] NF-7 — OpenCode plugin running on a fresh machine starts the channel via `npx` and `evalInBrowser` round-trips. Q3 resolved. Evidence: `scripts/test-ide.sh` OpenCode tier passes.
- [ ] `foxcode-channel@<next>` published on npm with maintainer `korchasa`. Evidence: `npm view foxcode-channel@<next> dist-tags`.
- [ ] Release lockstep verified. `scripts/release.sh X.Y.Z` bumps `foxcode/.claude-plugin/plugin.json`, `foxcode/channel/package.json`, `opencode/package.json`, and all pinned `foxcode-channel@…` literals (CC `foxcode/.mcp.json`, OpenCode snippet emitter, Codex payload). Evidence: `bash scripts/release.sh --dry-run 0.18.0` diff matches expected lockstep.
- [ ] Smoke test stays green. Evidence: `FOXCODE_SMOKE=1 bash scripts/check.sh` exits 0 (`scripts/test-npx-channel.sh` validates `npx -y foxcode-channel@<pinned> --version` in isolated HOME).
- [ ] CC plugin first-run on a machine with broken-nvm `npm` works (cold npx download path). Manual evidence in PR description.
- [ ] OpenCode plugin migration: existing user with `@korchasa/foxcode-opencode@0.16.4` installed upgrades to next version and the channel still starts (their `opencode.json` snippet is auto-rewritten by `setup --write-config`, or a migration note guides manual edit). Manual evidence in PR description.
- [ ] Docs synced.
  - [ ] `README.md`: install snippets for CC / Codex / OpenCode all show npx form.
  - [ ] `documents/requirements.md` NF-8 acceptance updated: marketplace install path checked via npx-based payload.
  - [ ] `documents/design.md` § Distribution & Setup: single subsection «MCP server: npm-distributed channel via `npx`», three sub-bullets for CC / Codex / OpenCode integration.
  - [ ] `AGENTS.md` Key Decisions: replace the Codex glob-workaround bullet (line 131) with the npx decision; cite `loader.rs::normalize_plugin_mcp_server_value` and `hooks/src/engine/discovery.rs:219-228` as future-contributor pointers; remove the `${CLAUDE_PLUGIN_ROOT}`/`npm ci`-in-cache bullet (line 122).

## Solution

### Step 1 — Decide pinned version, channel rename status, and OpenCode bundle cut

- Current working-tree state already has `foxcode-channel@0.4.2` (unscoped). Either:
  - **(a)** Adopt 0.4.2 as the baseline and commit the rename + npx switch as one chore commit; OR
  - **(b)** Bump to `0.18.0` (continuing the plugin's SemVer line) at release time and ignore the historical 0.1.0–0.4.2 versions of the unscoped name.
- Chosen at planning time, recorded here; subsequent steps assume that version.
- `opencode/prepack.mjs`: stop copying `foxcode/channel/` into `bundle/`. Keep extension and skills.

### Step 2 — CC plugin MCP snippet (already in working tree, requires commit)

- `foxcode/.mcp.json`:
  ```json
  { "mcpServers": { "foxcode": { "command": "npx", "args": ["-y", "foxcode-channel@<pinned>"] } } }
  ```
- No `cwd`, no `env`, no `FOXCODE_PROJECT_DIR`. Channel uses `process.cwd()`.
- Verify: `claude plugin validate .` exits 0; `claude mcp list` shows `foxcode ✓ Connected`.

### Step 3 — OpenCode plugin snippet emitter

- `opencode/lib/mcp-snippet.mjs` (or wherever the snippet is built): change shape to npx form.
- `opencode/index.mjs` `session.created`: same change in the stderr-printed snippet.
- `opencode/bin/foxcode-opencode.mjs setup --write-config`: write the npx form into `opencode.json` `mcp.foxcode`.
- Tests: update `opencode/test/plugin.test.mjs`, `opencode/test/cli.test.mjs`, `opencode/lib/patcher.test.mjs` (snippet shape assertions).
- `opencode/prepack.mjs`: remove `foxcode/channel/` copy step. Update `opencode/test/pack.test.mjs` expectations.

### Step 4 — Codex plugin payload (re-scope of `plugin-src/codex/`)

- `plugin-src/codex/.agents/plugins/marketplace.json`: object-form source pointing at the codex payload sub-path (per flowai-workflow reference cited in superseded task).
- `plugin-src/codex/plugins/foxcode/.codex-plugin/plugin.json`: Codex plugin metadata + skills list.
- `plugin-src/codex/plugins/foxcode/.mcp.json`: top-level key = MCP server name (Codex shape):
  ```json
  { "foxcode": { "command": "npx", "args": ["-y", "foxcode-channel@<pinned>"] } }
  ```
  No `cwd`. No `env`.
- `plugin-src/codex/plugins/foxcode/skills/`: symlink or copy from `foxcode/skills/` (single source of truth; build script decides). Skills resolve plugin root from `SKILL.md` path, then `plugin_root/extension`.
- `plugin-src/codex/plugins/foxcode/extension/`: copied from `foxcode/extension/` at build time.
- `scripts/build-plugin-payload.mjs`: rework to generate Codex payload from `plugin-src/codex/` + canonical `foxcode/` sources. Stays a pure-build script — no runtime concerns.

### Step 5 — Codex plugin install + MCP probe (resolves Q1, Q2)

- Extend `scripts/codex-plugin-install.test.mjs`:
  - Build payload, `codex plugin marketplace add` against payload path, `codex plugin add foxcode@<marketplace>`.
  - Assert payload landed in `~/.codex/plugins/cache/.../foxcode/<ver>/`.
- Extend `scripts/codex-plugin-mcp.test.mjs`:
  - After install, run `codex mcp list --json` and assert `foxcode` is connected.
  - Spawn a Codex session in an isolated dir, call `status`, assert `projectDir == that isolated dir` (Q1).
  - If Q1 fails, fall back to a `SessionStart` hook implementation (separate sub-task documented here, not implemented unless needed).

### Step 6 — Release script lockstep (already covers most files, verify and extend)

- `scripts/release.sh` (working tree) already bumps the four files for the renamed `foxcode-channel`. Add a sixth file: `plugin-src/codex/plugins/foxcode/.mcp.json` (npx pin literal). Add (if separate): the OpenCode snippet emitter's pin literal source.
- Add a guard: refuse to bump if `npm view foxcode-channel@<new>` already exists (prevents re-publishing collision).

### Step 7 — Docs sync

- `README.md`: three install snippets (CC, Codex, OpenCode) all npx form. Migration note for users with hand-rolled `~/.codex/config.toml`.
- `documents/requirements.md` NF-8 acceptance: mark «Codex plugin marketplace install path» based on the new payload; add evidence.
- `documents/design.md` § Distribution & Setup: single «MCP server: npm-distributed channel via npx» subsection.
- `AGENTS.md` Key Decisions: rewrite Codex bullet, channel-bundling bullet; cite loader.rs / discovery.rs references.

### Step 8 — Publish + verify on real machines

- `npm publish` (from `foxcode/channel/`) with the chosen pinned version.
- Tag `foxcode@<ver>`, push, update marketplace pointer.
- Run validation matrix from DoD on a clean macOS profile and a clean Linux profile.
- Update PR description with matrix outcomes; merge only after all rows green.

### Out of Scope

- Switching the channel's transport (still WebSocket on localhost).
- Migrating away from Firefox / WebExtension Manifest V2.
- Codex hook-based `~/.codex/config.toml` rewriting (only invoked as Q1 fallback).
- JSR / non-npm registries for the channel.
- Refactoring `foxcode/channel/` internals beyond what the snippet shape change demands.

### Risks

- **Q1 negative (Codex forces MCP cwd to plugin root).** Then `process.cwd()` in the channel is the plugin cache, not the project dir, and `status` reports wrong scope. Fallback: a Codex `SessionStart` hook writes `~/.foxcode/codex-project-dir` and the channel reads it at first tool call. Implementation cost ≈ ½ day; design covered in superseded `codex-plugin-marketplace-payload.md` Open Questions.
- **Network outage on first user invocation.** `npx` prints its own stderr. No project-side hide. Acceptable per «fail fast, fail clearly».
- **`npx` cold start 300–1500 ms.** Future startups <100 ms. MCP host's own startup dominates total.
- **Out-of-order release.** Plugin tagged before `npm publish` = broken install. Release script enforces order; CI step fails the release if `npm publish` did not succeed.
- **Private npm registries that do not mirror unscoped names from the public registry.** Mitigation: README note pointing at `.npmrc` config. No project-side change.
- **Pinned literal drift across the six files.** Mitigation: release script writes all of them; reviewer checks the lockstep diff (commit must touch all bumped files together).
