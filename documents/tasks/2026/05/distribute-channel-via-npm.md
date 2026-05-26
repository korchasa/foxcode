---
date: "2026-05-26"
status: in progress
implements: [NF-8]
tags: [distribution, codex, packaging, mcp, channel]
related_tasks:
  - documents/tasks/2026/05/add-opencode-support.md
---

# Distribute foxcode channel as npm package (`@korchasa/foxcode-channel`)

## Goal

Replace the `${CLAUDE_PLUGIN_ROOT}` + `npm ci`-in-plugin-cache launch pattern in the CC plugin's `.mcp.json` and the manual Codex `[mcp_servers.foxcode]` snippet with a single portable command: `npx -y @korchasa/foxcode-channel@<pinned-version>`. This is the only change that simultaneously (a) removes the need for Codex to expand `${CLAUDE_PLUGIN_ROOT}` (which it does not — see `loader.rs::normalize_plugin_mcp_server_value`), (b) keeps `$PWD == user project dir` at MCP launch (Codex inherits cwd into MCP child processes), (c) eliminates the broken-nvm-npm class of failures (root cause of the bug that triggered this task), and (d) unifies CC and Codex launch into a single artifact.

Without it: every release that touches launch logic must be hand-mirrored into the user's `~/.codex/config.toml`; users keep hitting `connection closed: initialize response` whenever their `npm`/`node` pairing drifts (nvm switches, brew upgrades); and Codex plugin install (NF-8 last item) cannot be unblocked because the plugin-provided `.mcp.json` is structurally untranslatable to Codex semantics.

## Overview

### Context

- **Codex MCP plugin loader** (`openai/codex` main, `codex-rs/core-plugins/src/loader.rs`): for each entry in plugin's `.mcp.json` it only normalizes `type`, `oauth.clientId → client_id`, and resolves **relative `cwd`** against `plugin_root`. It does **not** expand any `${…}` placeholder in `command`/`args`/`env`. So plugin authors who write `"${CLAUDE_PLUGIN_ROOT}"` get the literal string at the MCP process.
- **Codex hook engine** (`codex-rs/hooks/src/engine/discovery.rs:219-228`): injects `PLUGIN_ROOT`, `CLAUDE_PLUGIN_ROOT`, `PLUGIN_DATA`, `CLAUDE_PLUGIN_DATA` only into **hook** command environments. MCP child processes receive none of these.
- **Current foxcode launch contract** (`foxcode/.mcp.json`): `sh -c "set -e; export FOXCODE_PROJECT_DIR=\"$PWD\"; cd \"$1\"/channel; NPM_BIN=…; \"$NPM_BIN\" ci --omit=dev --silent; exec node server.mjs" foxcode-channel "${CLAUDE_PLUGIN_ROOT}"`. Works in CC only because CC expands `${CLAUDE_PLUGIN_ROOT}`. Fails in Codex because the placeholder is not expanded, and even if it were, the `npm ci` inside a read-only plugin cache is fragile (broken nvm symlinks, missing PATH npm, sandboxed cache directories).
- **Existing parallel** (`@korchasa/foxcode-opencode`): already proves the pattern of publishing a scoped npm package from this repo with the channel deps and the channel source files. `opencode/prepack.mjs` already copies `foxcode/channel/` into the OpenCode bundle.
- **Existing channel package.json** (`foxcode/channel/package.json`): already declares `"name": "foxcode-channel"`, `"bin": { "foxcode-channel": "server.mjs" }`, `"files": ["server.mjs", "lib.mjs", "validator.mjs"]`, `"dependencies": { "@modelcontextprotocol/sdk", "ws" }`. Renaming to `@korchasa/foxcode-channel` and publishing is a one-line change plus npm credentials.

### Current State

- `foxcode/.mcp.json` (CC plugin): uses `${CLAUDE_PLUGIN_ROOT}` + `npm ci` in cache. Just fixed (`fix(mcp): fall back to PATH npm when node-paired symlink is broken`, commit `8915945`) to handle broken nvm npm, but the structural fragility remains.
- `~/.codex/config.toml` (per-user manual workaround per NF-8 / CLAUDE.md Key Decisions): hand-written `[mcp_servers.foxcode]` block with a glob over `~/.codex/plugins/cache/korchasa/foxcode/<ver>/channel`, identical shape to the CC `.mcp.json`. Not auto-updated on plugin upgrade — drift between repo and user machine caused the present incident.
- `foxcode/channel/`: unscoped npm-package-shaped, never actually published to npm. Treated as a sub-folder shipped inside the CC plugin cache.
- `opencode/prepack.mjs`: copies `foxcode/channel/` into `bundle/channel/`. OpenCode launches `node bundle/channel/server.mjs` directly.
- NF-8 acceptance criterion "Codex plugin marketplace install path" — **unchecked**. Two paths sketched: (a) marketplace.json object form, (b) `.codex-plugin/plugin.json` companion manifest. Both presuppose Codex can actually launch the plugin's MCP — which today it cannot, because of the `${CLAUDE_PLUGIN_ROOT}` issue. This task removes that blocker.

### Constraints

- **No regression for existing CC users.** CC users on `foxcode@0.16.4` and earlier must keep working bit-for-bit until they upgrade. The npm-based `.mcp.json` ships in a new plugin version. Mixed states (old plugin, new CC) and (new plugin, old CC) must both work or fail with a clear message.
- **No regression for existing OpenCode users.** `opencode/index.mjs` and the bundled `bundle/channel/` path stay functional. `npx` is **not** introduced into OpenCode flow in this task — OpenCode already has a working bundled-channel path with absolute-path command; switching it to npx adds first-run latency without benefit. (Could be revisited in a follow-up if dedup becomes a maintenance pain.)
- **Single source of truth.** `foxcode/channel/{server.mjs,lib.mjs,validator.mjs}` remains the only place the channel code lives. The npm package publishes from this folder. The OpenCode bundle copies from this folder. No code fork.
- **Version sync.** The npm package version MUST equal the plugin version at release time. Mechanism: release script (`scripts/release.sh` or equivalent) bumps `foxcode/.claude-plugin/plugin.json`, `foxcode/channel/package.json`, `opencode/package.json`, and the pinned version literal inside `foxcode/.mcp.json` in lockstep, in one commit. Drift is a release-process bug, not a runtime concern.
- **Pin exact version, do not float.** Plugin `.mcp.json` uses `@korchasa/foxcode-channel@0.X.Y` (no caret, no `latest`), so an upgrade to the channel cannot silently propagate to users still on an older plugin. (Floating would break the "user upgrades the plugin to get the fix" contract from NF-1.)
- **`npx -y` semantics.** First invocation downloads to `~/.npm/_npx/<hash>` (~300–1500 ms, depending on registry latency). Subsequent invocations are cache hits and start in <100 ms. Offline behaviour: `npx --prefer-offline` is **not** added — failing loudly is better than silently using a stale cached version.
- **Network failure visibility.** If `npx` cannot reach the registry on first install, the user must see a clear stderr message ("npm registry unreachable — connect to network and retry") rather than a generic MCP handshake failure. Channel's own startup error path is unchanged; the new failure mode lives entirely inside `npx`, which already prints to stderr.
- **No new runtime dependency.** Channel keeps `@modelcontextprotocol/sdk`, `ws`. No additions.
- **Codex `[mcp_servers.foxcode]` manual snippet documentation must be updated** in lockstep with this change. Users who already have a hand-rolled snippet should be guided to the new shape via a migration note.
- **CC plugin payload must still work without npm-pack publishing.** The CC plugin `.mcp.json` references `npx -y @korchasa/foxcode-channel@X.Y.Z` — that pin must point at a version that is **published on npm before the corresponding plugin version is released**. Out-of-order release = broken install. Release script enforces order: `npm publish` first (channel), then `git tag` (plugin), then marketplace pointer update.
- **Self-host friendliness.** Users behind a private npm registry (`.npmrc` with `registry=…`) get the same behaviour without project-side changes — `npx` honours `.npmrc`. No project-side code paths.

## Definition of Done

Each item: `FR — Test/Benchmark — Evidence`.

- [ ] **NF-8 acceptance criterion "Codex plugin marketplace install path"** updated: removed the `${CLAUDE_PLUGIN_ROOT}` blocker note, replaced with concrete `npx -y @korchasa/foxcode-channel@<ver>` shape, evidence link to live `codex mcp list` showing `foxcode … ✓ Connected` after `codex plugin install foxcode@korchasa`.
- [x] **`foxcode/channel/package.json` renamed to `@korchasa/foxcode-channel`** with `"publishConfig": { "access": "public" }`, `"files"` audited to include exactly `server.mjs`, `lib.mjs`, `validator.mjs` (no tests, no node_modules). Evidence: `foxcode/channel/package.json:2`, `foxcode/channel/pack.test.mjs:23` (scoped-name assertion), `foxcode/channel/pack.test.mjs:34` (excludes test files), `foxcode/channel/pack.test.mjs:40` (excludes node_modules + lockfile).
- [x] **`foxcode/channel/server.mjs` shebang verified** as `#!/usr/bin/env node` and made executable in published artifact (`bin` field already declared). Evidence: `foxcode/channel/server.mjs:1` (shebang); `foxcode/channel/package.json` `bin.foxcode-channel = server.mjs`.
- [x] **Channel startup uses `process.cwd()` as project-dir source-of-truth when `FOXCODE_PROJECT_DIR` env var is unset.** Evidence: `foxcode/channel/lib.mjs::resolveProjectDir`, `foxcode/channel/lib.test.mjs:225-255` (env-set / env-empty / env-missing / default-process.env branches), `foxcode/channel/server.mjs` (all three call sites refactored).
- [ ] **CC plugin `foxcode/.mcp.json` rewritten** to `{ "command": "npx", "args": ["-y", "@korchasa/foxcode-channel@X.Y.Z"] }`. No more `sh -c`, no more `${CLAUDE_PLUGIN_ROOT}`, no more `npm ci`. **Deferred — must follow `npm publish` to avoid breaking installed CC users.**
- [ ] **Documentation/templates for Codex `[mcp_servers.foxcode]`** updated to the new shape: `command = "npx"`, `args = ["-y", "@korchasa/foxcode-channel@<ver>"]`. **Deferred — synced with the `.mcp.json` rewrite commit.**
- [x] **Release script** (`scripts/release.sh`): bumps the same SemVer across `foxcode/.claude-plugin/plugin.json`, `foxcode/channel/package.json`, `opencode/package.json`, and rewrites the pinned `@korchasa/foxcode-channel@X.Y.Z` literal inside `foxcode/.mcp.json`. Evidence: `scripts/release.sh`, `opencode/test/release-script.test.mjs` (dry-run preserves mtimes + content; rejects invalid SemVer; prints `npm publish` / `git tag` follow-ups). **Note:** script prints follow-ups but does NOT auto-`npm publish` / auto-`git tag` (safer); CI ordering deferred.
- [x] **`opencode/prepack.mjs` continues to copy from `foxcode/channel/`** unchanged. Evidence: `cd opencode && npm pack --dry-run` lists `bundle/channel/server.mjs` (verified post-rename); `bash scripts/check.sh` opencode + acceptance tests green (14/14 + 6/6).
- [x] **Cross-runner smoke test added** (`scripts/test-npx-channel.sh`). Evidence: `scripts/test-npx-channel.sh` (isolated `HOME` + `npm_config_cache`, derives version from `foxcode/channel/package.json`), `opencode/test/smoke-script.test.mjs` (structure assertions), `scripts/AGENTS.md` (opt-in `FOXCODE_SMOKE=1` documented). Live end-to-end run pending npm publish.
- [x] **`server.mjs` accepts an optional `--help` / `--version` flag** that prints to stdout and exits 0 without opening the WebSocket port. Evidence: `foxcode/channel/server.mjs:31-50` (argv branch before socket creation), `foxcode/channel/server.test.mjs:36-78` (spawn-based exit-0 tests for `--help`, `-h`, `--version`, `-v`).
- [ ] **Manual on-machine validation matrix** (recorded in the PR description, one row per cell):
  - [ ] CC plugin, fresh install on machine with broken nvm npm — connects.
  - [ ] CC plugin, fresh install on machine with no nvm at all — connects.
  - [ ] Codex CLI, manual `[mcp_servers.foxcode]` snippet (new shape) — connects.
  - [ ] Codex CLI, plugin marketplace install path (if NF-8 sub-task A or B also landed in this task or a sibling) — connects.
  - [ ] OpenCode CLI — connects (regression check).
- [ ] **`CLAUDE.md` Key Decisions** updated: replace the bullet about "Workaround: global `[mcp_servers.foxcode]` entry in `~/.codex/config.toml` with a version-agnostic glob" with a bullet describing the npx-based command and citing the Codex loader behaviour (no `${…}` expansion, only `cwd` normalization). Add the loader.rs / discovery.rs file references for future contributors. **Deferred — synced with the `.mcp.json` rewrite commit.**
- [ ] **`documents/design.md` Section 8 "Distribution & Setup"** extended with a "Channel npm package" subsection. **Deferred — synced with the `.mcp.json` rewrite commit.**
- [x] **`scripts/check.sh`** updated to opt-in run the npx smoke test. Evidence: `scripts/check.sh:74-78` (`FOXCODE_SMOKE=1` gate), `bash scripts/check.sh` → exit 0 (Tier 1+2 acceptance + 46 channel + 14 opencode unit tests + 26 Python tests).
- [ ] **`@korchasa/foxcode-channel@<ver>` published to npm.** **Deferred — requires maintainer npm credentials.**

**Test/Evidence registry** (single source of truth):
- All Node tests: `node --test foxcode/channel/*.test.mjs opencode/lib/*.test.mjs opencode/test/*.test.mjs` → all pass.
- Repo-wide check: `bash scripts/check.sh` → exit 0.
- CC plugin: `claude plugin validate .` → "Validation passed".
- Pack dry-runs: `cd foxcode/channel && npm pack --dry-run`, `cd opencode && npm pack --dry-run`.
- Smoke: `bash scripts/test-npx-channel.sh` → exit 0 in <15 s cold, <5 s warm.

## Solution

### Variant selected: C (channel as scoped npm package, invoked via `npx -y`)

Other variants ruled out in chat on 2026-05-26 (see conversation log of this date):

- **A (relative `cwd` in plugin `.mcp.json`):** half-fix — solves `${…}` expansion via the one transform Codex does, but breaks `FOXCODE_PROJECT_DIR=$PWD` because Codex changes the child's cwd to `plugin_root/channel`, making `$PWD` no longer the user's project dir. No env-var alternative exists in Codex.
- **B (separate `.codex-plugin/plugin.json` + `.mcp.codex.json`):** structural cleanup; doesn't address content. Inside it we still face A or C.
- **D (Codex `SessionStart` hook self-repairing `~/.codex/config.toml`):** invasive write to user-owned TOML, hard to do safely round-trip with comments/formatting; only repairs Codex (CC still needs its own path); hook event-order vs MCP-startup ordering not guaranteed.

### Plan

#### Step 1 — Channel package: rename and add publish metadata

- Edit `foxcode/channel/package.json`:
  - `"name": "@korchasa/foxcode-channel"`
  - Add `"publishConfig": { "access": "public" }`
  - Keep `"bin": { "foxcode-channel": "server.mjs" }`
  - Audit `"files"`: ensure only published runtime files (no test files).
  - Bump `"version"` to the next plugin SemVer (e.g. `0.17.0`).
- Add a minimal `foxcode/channel/README.md` (one paragraph + install snippet) so npm renders something useful on the package page.
- Ensure `server.mjs` first line is `#!/usr/bin/env node` and the file is committed with executable bit (`git update-index --chmod=+x`).
- Tests: extend `foxcode/channel/server.test.mjs` with cases:
  - `--help` exits 0 with stdout containing version.
  - `--version` exits 0 with stdout matching `package.json`'s version.
  - No-arg invocation behaves as today (server start path covered by existing tests).
- Verify: `cd foxcode/channel && npm pack --dry-run` — expected file list is just `package.json`, `server.mjs`, `lib.mjs`, `validator.mjs`, `README.md`, `LICENSE` (if added).

#### Step 2 — CC plugin `.mcp.json` rewrite

- Replace `foxcode/.mcp.json` body with:
  ```json
  {
    "mcpServers": {
      "foxcode": {
        "command": "npx",
        "args": ["-y", "@korchasa/foxcode-channel@<pinned>"]
      }
    }
  }
  ```
  where `<pinned>` is the exact SemVer that will be published in this release.
- No `cwd`, no `env`, no `FOXCODE_PROJECT_DIR`. Channel falls back to `process.cwd()` (which is the user's project dir under both CC and Codex when no `cwd` is set).
- Verify: `claude plugin validate .` passes; `claude mcp list` from a clean cache shows the server connecting.

#### Step 3 — Channel runtime: derive project dir from `process.cwd()`

- In `foxcode/channel/server.mjs` (or `lib.mjs` where the project-dir resolution lives), introduce a single helper:
  ```js
  export function resolveProjectDir(env = process.env) {
    return env.FOXCODE_PROJECT_DIR && env.FOXCODE_PROJECT_DIR !== ""
      ? env.FOXCODE_PROJECT_DIR
      : process.cwd();
  }
  ```
- Replace all call sites that read `process.env.FOXCODE_PROJECT_DIR` directly. (Audit: `grep -n FOXCODE_PROJECT_DIR foxcode/channel/`)
- Tests: `foxcode/channel/lib.test.mjs` adds cases for env-set, env-empty, env-missing.
- Rationale: under `npx`, the channel inherits the user's cwd (no `cwd` field in `.mcp.json`, MCP host doesn't override). Under OpenCode bundled path, the env var is still set by the OpenCode plugin/CLI. Under Codex manual `[mcp_servers.foxcode]`, no env var is needed either. So `FOXCODE_PROJECT_DIR` becomes an explicit override, not a load-bearing default.

#### Step 4 — Documentation and Codex snippet

- Update `README.md`:
  - "Install in Codex (CLI)" section: replace the multi-line `args = ["sh", "-c", "…"]` snippet with the npx one-liner.
  - Add a one-line migration note: "If you have a previous `[mcp_servers.foxcode]` block in `~/.codex/config.toml`, replace it with the snippet below."
- Update `documents/requirements.md` NF-8 acceptance line for "Codex plugin marketplace install path":
  - Remove the "${CLAUDE_PLUGIN_ROOT}" blocker note.
  - Reframe remaining blocker (if any) purely around marketplace.json source-format / `.codex-plugin/plugin.json` companion — a separate task.
- Update `documents/design.md` Section 8: add "Channel npm package" subsection alongside the existing CC marketplace and OpenCode subsections.
- Update `CLAUDE.md`:
  - Replace the "Workaround: global `[mcp_servers.foxcode]` entry in `~/.codex/config.toml` with a version-agnostic glob" decision with the new npx-based decision.
  - Add the loader/discovery file references (loader.rs::normalize_plugin_mcp_server_value, hooks/src/engine/discovery.rs:219-228) as future-contributor pointers.

#### Step 5 — Release-script lockstep

- Audit existing release tooling. If `scripts/release.sh` exists, extend it. Otherwise create a minimal script that:
  - Accepts a single SemVer arg.
  - Updates four files atomically: `foxcode/.claude-plugin/plugin.json`, `foxcode/channel/package.json`, `opencode/package.json`, and the version literal inside `foxcode/.mcp.json` (sed/jq target the `@korchasa/foxcode-channel@X.Y.Z` token).
  - Runs `npm publish` from `foxcode/channel/` **before** tagging.
  - Tags `vX.Y.Z`.
- Tests for the script: dry-run mode that prints the planned edits without executing. Snapshot-style test or simple `diff` against expected post-state.

#### Step 6 — Smoke test (`scripts/test-npx-channel.sh`)

- Bash script:
  - `tmpdir=$(mktemp -d)`
  - `npm_config_cache=$tmpdir/cache HOME=$tmpdir npx -y @korchasa/foxcode-channel@<pinned> --help`
  - Asserts exit 0 and `<pinned>` substring in output.
  - Runs again from the same `HOME` to assert warm-cache path < 5 s wall time.
- Wired into `scripts/check.sh` only behind an opt-in env var (`FOXCODE_SMOKE=1`), so the check pipeline doesn't depend on the npm registry by default.

#### Step 7 — OpenCode regression check

- No code changes to `opencode/`. Verify:
  - `cd opencode && npm pack --dry-run` still lists `bundle/channel/server.mjs`.
  - `bash scripts/test-ide.sh` passes (OpenCode tier-4).
  - The new `resolveProjectDir` helper in channel works with OpenCode's `FOXCODE_PROJECT_DIR={env:PWD}` setup (which it does, because env-var is non-empty).

#### Step 8 — Publish + verify on real machines

- Publish `@korchasa/foxcode-channel@<ver>` to npm.
- Tag `foxcode@<ver>` and update the CC marketplace pointer.
- Run the on-machine validation matrix from Definition of Done.
- Update PR description with the matrix outcomes; only merge after all rows green.

### Out of scope (explicit non-goals for this task)

- Codex plugin marketplace install actually working end-to-end (NF-8 unchecked item). This task removes the `${CLAUDE_PLUGIN_ROOT}` blocker. The remaining work (marketplace.json source-format or `.codex-plugin/plugin.json`) is tracked separately.
- OpenCode switching to `npx` as its launch command. Defer until there is a concrete maintenance pain.
- Publishing the channel to JSR or any registry other than npm.
- Changing the channel's network protocol, port range, or auth model.
- Refactoring `foxcode/channel/` internals beyond the `resolveProjectDir` helper and the `--help`/`--version` flags.

### Risks

- **Registry outage on first user invocation.** Mitigation: clear stderr ("npm registry unreachable…") inherits from npx itself. No project-side fallback — surfacing the failure is correct per "fail fast, fail clearly".
- **`npx` cold start jitter.** Mitigation: pinned exact version means the resolved tarball is hash-stable; once cached, future starts are <100 ms. First-time install on a fresh machine ≈1 s overhead, dominated by MCP host's own startup.
- **Out-of-order release** (plugin tagged before `npm publish` succeeds) **= broken install for early upgraders.** Mitigation: release script enforces order; CI step fails the release if `npm publish` did not succeed.
- **Pinned version drifts behind a published `latest`.** Mitigation: release script bumps the pinned literal in `.mcp.json` in the same commit as the version bump. Reviewer checks the four-file lockstep diff.
- **Users with corp/private registries that don't proxy `@korchasa` scope.** Mitigation: doc note in README pointing at `npm config set @korchasa:registry …` if needed. No project-side change.
