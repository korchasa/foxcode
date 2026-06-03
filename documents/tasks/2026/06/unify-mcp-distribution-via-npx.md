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

- `foxcode/channel/package.json`: unscoped `foxcode-channel@0.4.2`. Working-tree edit, **defective** — see Investigation Evidence «Four-month publish gap».
- `foxcode/.mcp.json` (CC plugin): `command="npx"`, `args=["-y", "foxcode-channel@0.4.2"]`. Working-tree edit, **defective** — pins at the March 2026 obsolete artifact (different MCP architecture: `claude/channel` experimental capability, `reply`/`edit_message` tools, no password auth). Committing this ships a CC plugin that immediately `FATAL: Client does not support claude/channel` against modern MCP clients. Must not be committed before Phase 0 publishes a current-architecture version.
- `opencode/package.json`: `@korchasa/foxcode-opencode@0.16.4`. `opencode/index.mjs` still emits an absolute-path MCP snippet pointing at `bundle/channel/server.mjs`. `opencode/prepack.mjs` still copies `foxcode/channel/` into `bundle/channel/`. **`@korchasa/foxcode-opencode` is not published on npm** (`npm view` returns 404). Scope `@korchasa` does not exist on the registry.
- `.codex/config.toml`: repo-scoped MCP entry that `sh -c …`'s into `foxcode/channel`.
- `~/.codex/config.toml` (per user, undocumented to most installs): hand-rolled `[mcp_servers.foxcode]` block with version-agnostic glob over `~/.codex/plugins/cache/korchasa/foxcode/<ver>/channel`. Recorded as a Key Decision in `AGENTS.md` line 131 — to be replaced.
- `plugin-src/{claude,codex,shared}/` and `scripts/build-plugin-payload.mjs`: scaffolding from the now-superseded `codex-plugin-marketplace-payload` direction. Working tree, not committed. Action: re-scope as build-time generator for the unified npx-based payload (Codex `.codex-plugin/plugin.json` and CC `foxcode/.mcp.json` written from one source) — see Step 4.
- `scripts/codex-{env-probe-mcp,plugin-install,plugin-mcp,plugin-payload}.test.mjs`: empirical probes. Useful as-is for verifying Codex behaviour under npx (Step 5 acceptance). `scripts/codex-plugin-mcp.test.mjs` currently fails against pinned `foxcode-channel@0.4.2` for the reason described above — proves that pin must change.
- `foxcode-channel` on npm: 7 versions published 2026-03-28 in a 3.5-hour window (0.1.0 → 0.4.2). **No publishes since.** The published code is pre-MCP-only architecture and incompatible with the current channel.
- `@korchasa/foxcode-channel` on npm: **does not exist** (`npm view` returns 404). Commits `38b423b` and `8dc87ae` renamed the package to scoped form and bumped to 0.17.1 in preparation for publish, but `npm publish` was never executed.
- Past 15 plugin releases (`v0.13.0` … `v0.17.1`, 2026-04-01 … 2026-05-26) used the bundled `${CLAUDE_PLUGIN_ROOT}/channel` model. None required `npm publish`. The npx-everywhere plan inverts this dependency: every plugin release will require a successful prior `npm publish`.

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

#### Four-month publish gap (the publish pipeline is dead)

Investigated 2026-06-02 in this task's planning session. Findings:

- **Last npm publish for `foxcode-channel`: 2026-03-28.** Seven versions in one 3.5-hour window (`npm view foxcode-channel time`). Content of `foxcode-channel@0.4.2` (inspected via tarball download) declares the `claude/channel` experimental capability, uses `reply`/`edit_message` tools, lacks password auth — entirely different architecture from the current `evalInBrowser` + `status` MCP-only channel.
- **Last plugin git tag: `v0.17.1` on 2026-05-26.** Fifteen plugin releases between the last `npm publish` (2026-03-28) and now. None of them published anything to npm. The release script (`scripts/release.sh:107-111`) prints `npm publish` as a manual follow-up; nothing fails if it is skipped.
- **`@korchasa` scope does not exist on npm.** `npm view @korchasa/foxcode-channel` and `npm view @korchasa/foxcode-opencode` both return 404. The "prep" commits `38b423b` (rename channel to scoped) and `8dc87ae` (bump to 0.17.1) were preparatory edits only — the scope was never created, the package was never published, and `npm whoami` on this machine returns 401 (no authenticated session).
- **5-why root cause analysis:**
  1. Why no publish in four months? → `npm publish` is a manual follow-up.
  2. Why manual? → `release.sh` prints it as a step but does not execute it (commented as «safer»).
  3. Why no automation in CI? → No GitHub Actions workflow exists for npm publishing.
  4. Why didn't anyone run it by hand? → `npm whoami` returns 401; credentials were not set up. Additionally, the package name was not finalised (unscoped name held obsolete code; scoped name was prepared but the scope itself was not created on npm).
  5. Why was the name not finalised? → Between March (PoC architecture under unscoped `foxcode-channel`) and May (current architecture under «prep for scoped publish»), nobody decided whether to deprecate the old unscoped artifact, continue its SemVer line, or hard-cut to a fresh scoped name. The decision was deferred indefinitely; meanwhile the bundled-channel CC-plugin path kept working without any publish at all.

**Consequence for this task.** The unified npx-everywhere plan inverts the publish dependency: every plugin install will fail if the pinned npm version is not on the registry, or carries pre-MCP architecture. Phase 0 below must therefore restore the publish workflow end-to-end (auth, name choice, deprecation of the old artifact, publish, automation gate) before any Solution step that pins a version literal can be merged. Skipping Phase 0 ships a broken plugin.

### Open Questions (empirical — resolve before merging)

Q1. **Codex plugin MCP launch with `command="npx"` and no `cwd`.** Does Codex preserve the user-session cwd in the MCP child? If yes → `process.cwd()` in channel is the user's project dir, model works. If Codex forces cwd to plugin root or null, an explicit `FOXCODE_PROJECT_DIR={env:PWD}`-style hint is needed — but Codex does not interpolate env at MCP launch (per loader.rs). Then the fallback is a `SessionStart` hook writing project-dir state to `~/.foxcode/codex-project-dir` for the channel to read at first tool call.

Q2. **Codex `.codex-plugin/plugin.json` MCP wiring with `command="npx"`.** Does Codex install the plugin's MCP config into the user's effective MCP list, so `codex mcp list` shows `foxcode … ✓ Connected` after `codex plugin add foxcode@korchasa` without any `~/.codex/config.toml` edit? `codex-plugin-marketplace-payload.md` confirms install succeeds; only the bundled-source launch is broken. The npx variant should remove that breakage.

Q3. **OpenCode `opencode.json` MCP snippet with `command="npx"`.** Existing snippet uses absolute path. Verify OpenCode accepts plain `command="npx", args=["-y", "foxcode-channel@<ver>"]` without `cwd`, and that `FOXCODE_PROJECT_DIR` is not required (channel's `process.cwd()` default suffices).

Q4. **CC plugin running `command="npx"` against an unpublished pinned version.** Already proven manually for working-tree `foxcode-channel@0.4.2` (published). DoD requires same for the next bump (released as part of this task).

## Phases

The work is split into a hard precondition phase and three parallel-ish execution phases. Phase 0 is a **gate**: no work in Phases 1–3 may merge until Phase 0 is fully green.

- **Phase 0** — Restore the npm publish pipeline. Decide the channel package name and version baseline, deprecate the obsolete published code, restore credentials/automation, and ship a current-architecture release that `npx` can resolve. Output: a single pinned version literal (call it `<pinned>` throughout the rest of the task) that is **(a) live on npm**, **(b) carries the current MCP architecture**, **(c) starts cleanly under both CC and a plain stdio MCP client**.
- **Phase 1** — CC plugin switches `foxcode/.mcp.json` to npx with `<pinned>`. Mostly a commit of the working-tree edits, but the pin literal must come from Phase 0 (not the obsolete `0.4.2`).
- **Phase 2** — Codex plugin marketplace payload uses `<pinned>` in its plugin-local `.mcp.json`. Resolves Q1 and Q2 empirically.
- **Phase 3** — OpenCode plugin emits an npx snippet with `<pinned>` and stops bundling `bundle/channel/`.

Each phase has its own DoD subset below. Phases 1–3 may proceed in any order once Phase 0 is green.

## Phase 0 — Restore the npm publish pipeline (mandatory gate)

### Phase 0 — Goal

Re-establish the ability to release the channel to npm reliably, then prove that releasability with a real publish of the current-architecture code. End-state: a pinned version literal exists on npm, returns the current MCP tool set when launched, and the release script will refuse future releases without a successful publish.

### Phase 0 — Decisions to make explicitly (record the choice in this doc before proceeding)

D0.1 **Package name.** Two options:
  - **(a) Unscoped `foxcode-channel`** — continues the dormant npm package. Reuses existing maintainer ownership (`korchasa`). Requires deprecating 0.1.0…0.4.2 on npm with a clear message pointing at the current major. Requires bumping past 0.4.2 (recommend `0.5.0` for a major-shape change *or* `0.18.0` to align with plugin SemVer).
  - **(b) Scoped `@korchasa/foxcode-channel`** — requires creating the `@korchasa` npm scope first (free public scope: `npm access public @korchasa/foxcode-channel` after first `npm publish --access=public`). Clean slate, but leaves the obsolete unscoped artifact in place forever and forks the discoverability story.

  **Chosen: (a) Unscoped `foxcode-channel`** (recorded 2026-06-02). Single discoverable name, reuses `korchasa` ownership, single deprecation step against 0.1.0–0.4.2.

D0.2 **Version baseline.** Two sub-options conditional on D0.1:
  - **(a-1)** Continue unscoped line: bump to `0.5.0` (signals a major shape change while staying SemVer-clean).
  - **(a-2)** Continue unscoped line: jump to `0.18.0` to align with the plugin's current SemVer (`v0.17.1` → next plugin release is `v0.18.0`). Keeps channel and plugin in lockstep.
  - **(b-1)** Scoped: start at `0.18.0` for plugin alignment.

  **Chosen: (a-2) jump to `0.18.0`** (recorded 2026-06-02). Aligns channel SemVer with the next plugin release; single SemVer line for plugin/channel/OpenCode lockstep going forward. `<pinned>` literal throughout the rest of this document = `0.18.0` once Phase 0 P0.9 promotes it to `latest`.

D0.3 **npm credentials.** Two options:
  - **Personal account `korchasa`** with a granular token scoped to publish-only for `foxcode-channel` and (later) `@korchasa/foxcode-opencode`. Stored in `~/.npmrc` for local releases; replicated as a GitHub Actions secret (`NPM_TOKEN`) for automation.
  - **Org account** — not applicable; this is a personal project.

  **Chosen: personal account `korchasa` + granular token, token lives ONLY in GitHub Actions secret `NPM_TOKEN`** (recorded 2026-06-02). No local `~/.npmrc` token by policy — all publishes go through CI (see D0.4). Local `npm publish` from a developer machine is disallowed. Token scope: publish + read on packages `foxcode-channel` and `@korchasa/foxcode-opencode`. Expiry: calendar reminder, not a task gate.

D0.4 **Publish automation.** Two options:
  - **Manual but gated**: keep `release.sh` printing `npm publish` as a step, but add a post-release verification (`npm view foxcode-channel@<ver>`) that fails the script if the publish was skipped. Forces the human to actually run it.
  - **CI-driven publish on tag**: GitHub Actions workflow that publishes on `v*` tag push using `NPM_TOKEN`. Removes the human-skip-step risk entirely.

  **Chosen: (b) CI-driven publish on tag** (recorded 2026-06-02). `.github/workflows/publish.yml` triggers on push of `v*` tags (and, for the first rc, a dedicated `channel-v*-rc.*` tag pattern), authenticates with `NPM_TOKEN`, runs `npm publish` from `foxcode/channel/`. Local `release.sh` only bumps version literals, commits, tags, and pushes — it never calls `npm publish` directly. P0.12 is therefore part of Phase 0, not deferred. P0.8 (release-script post-publish gate via `npm view`) still applies: the script polls the registry after pushing the tag and exits non-zero if CI did not publish within a timeout.

D0.5 **Treatment of the obsolete 0.1.0–0.4.2 versions.** Deprecate on npm with a stderr message guiding users to the new line:
  ```
  npm deprecate 'foxcode-channel@<=0.4.2' \
    'foxcode-channel <=0.4.2 implements an obsolete MCP architecture (claude/channel experimental capability). Use foxcode-channel@>=0.18.0 for the current MCP-only protocol.'
  ```
  This makes the obsolete artifact discoverable but loud about its status; it does not unpublish (npm forbids unpublish after 72h).

  **Chosen: deprecate `<=0.4.2` with the message above** (recorded 2026-06-02). Executed via CI (one-shot workflow dispatch or manual `npm deprecate` step in the publish workflow) after P0.9 promotes `0.18.0` to `latest`.

### Phase 0 — Definition of Done (gate for everything else)

P0.1. **Decisions D0.1–D0.5 recorded** in this document (replace the «Recommendation» lines with the actual chosen variant). Evidence: this section, post-edit.

P0.2. **`npm whoami` returns `korchasa`** locally and from CI. Evidence: `npm whoami` exits 0 with the expected username; CI logs same.

P0.3. **npm scope exists if D0.1 chose option (b).** Evidence: `npm access list packages @korchasa` returns at least one package; or skip if D0.1 is (a).

P0.4. **`foxcode/channel/package.json` updated** with the chosen package name (D0.1) and version (D0.2). Evidence: `jq .name,.version foxcode/channel/package.json`.

P0.5. **Test publish of `<chosen-name>@<chosen-version>-rc.1` succeeds.** Use a pre-release tag so production users do not pick it up. Evidence:
  ```
  cd foxcode/channel && npm publish --tag rc --access public --dry-run    # inspect contents
  cd foxcode/channel && npm publish --tag rc --access public              # actual publish
  npm view <chosen-name>@<chosen-version>-rc.1 dist.tarball               # exists
  ```

P0.6. **`npx -y <chosen-name>@<chosen-version>-rc.1 --version` returns the expected version** from an isolated HOME. Evidence: `scripts/test-npx-channel.sh` adapted to the rc tag, exits 0 in <15 s cold, <5 s warm.

P0.7. **`npx -y <chosen-name>@<chosen-version>-rc.1` starts cleanly under a plain stdio MCP client** (no `claude/channel` capability, no extra flags). Evidence: extend `scripts/codex-plugin-mcp.test.mjs` (or add a sibling) to spawn the npx-resolved binary, run `initialize` + `tools/list`, assert tools are `["evalInBrowser", "status"]`. The failure mode that caused this task's planning session (FATAL `Client does not support claude/channel`) must not recur. Evidence: `node --test scripts/<new-or-extended>.test.mjs` passes.

P0.8. **`release.sh` gates on publish.** After bumping the version literals, the script verifies `npm view <name>@<version>` returns the expected tarball before printing the «commit + tag» follow-up. If the publish was skipped, the script exits non-zero and instructs the human to run `npm publish` first. Evidence: `scripts/release.sh --dry-run 0.18.1` after a fake-skip prints the gate failure; same after a real publish prints the commit instructions.

P0.9. **Promote rc to stable.** Once P0.5–P0.7 are green, publish the same code as `<chosen-version>` (no `-rc.N` suffix) on the `latest` dist-tag. Evidence: `npm view <name> dist-tags.latest` equals `<chosen-version>`.

P0.10. **Deprecate obsolete versions (D0.5).** Evidence: `npm view <name>@0.4.2 deprecated` returns the deprecation message.

P0.11. **README updated** with one paragraph + an install snippet so the npm package page is informative. Evidence: visit `https://www.npmjs.com/package/<name>` — see the rendered README.

P0.12. **CI workflow (optional, deferred until first manual release proven)** publishes on `v*` tag push using `NPM_TOKEN`. Evidence: `.github/workflows/publish.yml` runs on a test tag, posts a draft release with the published tarball reference.

### Phase 0 — Solution sketch

0.1. **Audit** (`npm whoami`, `npm view <both-candidates>`, `gh release list`, `git log --since 2026-03-28 -- foxcode/channel/`). Confirm 5-why findings from Investigation Evidence still hold at execution time.

0.2. **Record decisions D0.1–D0.5** in this document.

0.3. **Create personal access token** on npmjs.com (Granular Access, package-scope `foxcode-channel` *and* `@korchasa/foxcode-opencode` for later, publish + read). Store in `~/.npmrc` (`//registry.npmjs.org/:_authToken=…`). Mode 0600.

0.4. **Bump `foxcode/channel/package.json`** name (if changed by D0.1) and version to `<chosen-version>-rc.1`. Do NOT touch any pin literal yet — the rc tag stays out of `latest` and out of `foxcode/.mcp.json`.

0.5. **Run `cd foxcode/channel && npm publish --tag rc --access public --dry-run`**. Inspect the file list. It must be exactly `package.json server.mjs lib.mjs validator.mjs` (and optionally `README.md`/`LICENSE`). If anything else appears (test files, `node_modules/`, lockfile), fix `files` in `package.json` before the real publish.

0.6. **Publish rc.** `cd foxcode/channel && npm publish --tag rc --access public`. Capture stdout for the PR description.

0.7. **Smoke** (P0.6 + P0.7). If P0.7 fails, do NOT promote. Diagnose locally (channel might still depend on an env var or capability the rc invocation does not provide).

0.8. **Promote.** Either re-publish with no `--tag` (so `latest` updates), or run `npm dist-tag add <name>@<chosen-version> latest`. The second avoids re-uploading the tarball.

0.9. **Deprecate old.** Run the `npm deprecate` command from D0.5. Verify with `npm view <name>@0.4.2 deprecated`.

0.10. **Gate release.sh.** Add the `npm view` post-bump check. Document in `scripts/AGENTS.md`.

0.11. **Document baseline in `AGENTS.md` Key Decisions** so subsequent contributors see the channel-name/version-baseline policy without reading this task file.

0.12. **Mark Phase 0 complete** in this document (`status: in progress` becomes `in progress (Phase 1 next)`). Phases 1–3 unblock.

### Phase 0 — Risks

- **Token leakage.** Mitigation: granular token (publish-only, package-scoped), short expiry, never committed.
- **Wrong package gets `latest` during the rc run.** Mitigation: explicit `--tag rc` on the rc publish; promotion via `dist-tag add` only after smoke passes.
- **Old 0.4.2 keeps being installed by stale plugin installations** (CC plugin cache pre-upgrade). Mitigation: deprecation warning surfaces on `npx` resolution. Users on installed plugins ≤ `v0.17.1` still use the bundled-channel path and never touch npm; only the new plugin release pins the new version.

## Definition of Done

Each item: criterion — test / evidence command. Empirical (Q1–Q4) items resolved with positive evidence; negative resolutions trigger fallback design and a re-scope of this task.

**Phase 0 (gate — see Phase 0 section above):** P0.1–P0.11 ALL `[x]` before any Phase 1/2/3 item below may be merged. P0.12 (CI publish-on-tag) may follow Phase 1 if D0.4 is set to «manual but gated».

Phase 1 — Claude Code plugin:

- [ ] NF-7 / NF-8 — `foxcode/.mcp.json` (CC plugin) uses `{ "command": "npx", "args": ["-y", "foxcode-channel@<pinned>"] }` with no `cwd` and no `env`, where `<pinned>` is the version from Phase 0 P0.9 (NOT the obsolete `0.4.2`). Evidence: `cat foxcode/.mcp.json`; `claude plugin validate .` exits 0; `npm view foxcode-channel@<pinned> dist-tags.latest` equals `<pinned>`.
Phase 2 — Codex plugin marketplace:

- [ ] NF-8 — Codex plugin payload exists under `plugin-src/codex/` with `.agents/plugins/marketplace.json`, `.codex-plugin/plugin.json`, and a Codex-shaped `.mcp.json` whose `mcpServers.foxcode = { command: "npx", args: ["-y", "foxcode-channel@<pinned>"] }`. Evidence: `node --test scripts/codex-plugin-payload.test.mjs`.
- [ ] NF-8 — `codex plugin marketplace add` + `codex plugin add foxcode@korchasa` against the built payload succeeds in an isolated `CODEX_HOME`. Evidence: `node --test scripts/codex-plugin-install.test.mjs`.
- [ ] NF-8 — installed Codex plugin's MCP server starts via npx and `codex mcp list` shows `foxcode … ✓ Connected` without any user-edited `~/.codex/config.toml`. Test: `scripts/codex-plugin-mcp.test.mjs::installed codex mcp tools list`. Evidence: `node --test scripts/codex-plugin-mcp.test.mjs`.
- [ ] NF-8 — channel running under Codex plugin install reports the **user's project directory** (not plugin cache) for `status`. Q1 resolved positively, or fallback (SessionStart hook writing `~/.foxcode/codex-project-dir`) implemented and tested. Evidence: probe via `mcp__plugin_foxcode_foxcode__status` from an isolated session, asserts `projectDir == $PWD`.
Phase 3 — OpenCode plugin:

- [ ] NF-7 — OpenCode plugin (`@korchasa/foxcode-opencode`) emits an npx-shaped MCP snippet on `session.created` and CLI `setup --write-config`. `bundle/channel/` is no longer copied at prepack; bundle ships skills + extension only. Evidence: `cd opencode && npm pack --dry-run` shows no `bundle/channel/`; `opencode/test/plugin.test.mjs` and `opencode/test/cli.test.mjs` pass after asserting the new snippet shape.
- [ ] NF-7 — OpenCode plugin running on a fresh machine starts the channel via `npx` and `evalInBrowser` round-trips. Q3 resolved. Evidence: `scripts/test-ide.sh` OpenCode tier passes.
Cross-phase / hygiene:

- [ ] Phase 0 explicitly references `<pinned>` baseline = the version chosen in D0.2 and promoted in P0.9.
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

### Step 1 — Phase 0 gate

This step is **Phase 0** (see «Phase 0 — Restore the npm publish pipeline» above). No code edits in Steps 2–8 can be merged until Phase 0 DoD items P0.1–P0.11 are all `[x]`. The pinned version literal `<pinned>` referenced everywhere below is whatever Phase 0 P0.9 promoted to `latest`.

Working-tree note: the current `foxcode/channel/package.json` (`foxcode-channel@0.4.2`) and `foxcode/.mcp.json` (`npx -y foxcode-channel@0.4.2`) are **defective** — they pin at the March 2026 obsolete artifact. Phase 0 must rewrite the version literal (and possibly the name, per D0.1) before Step 2 commits a CC `.mcp.json` change.

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

### Step 6 — Release script lockstep (extension of Phase 0 step 0.10)

- `scripts/release.sh` (working tree) already bumps the four files for the renamed `foxcode-channel`. Phase 0 added the post-publish gate. This step adds:
  - A sixth lockstep target: `plugin-src/codex/plugins/foxcode/.mcp.json` (npx pin literal).
  - (If separate) the OpenCode snippet emitter's pin literal source.
  - A pre-publish guard: refuse to bump if `npm view foxcode-channel@<new>` already exists (prevents re-publishing collision against an existing version).

### Step 7 — Docs sync

- `README.md`: three install snippets (CC, Codex, OpenCode) all npx form. Migration note for users with hand-rolled `~/.codex/config.toml`.
- `documents/requirements.md` NF-8 acceptance: mark «Codex plugin marketplace install path» based on the new payload; add evidence.
- `documents/design.md` § Distribution & Setup: single «MCP server: npm-distributed channel via npx» subsection.
- `AGENTS.md` Key Decisions: rewrite Codex bullet, channel-bundling bullet; cite loader.rs / discovery.rs references.

### Step 8 — Stable publish + verify on real machines

Phase 0 already published the `<pinned>` baseline (rc → promoted to `latest` in P0.9). This step is the *next* plugin release on top of the Phase-1/2/3 edits:

- `scripts/release.sh X.Y.Z` (post-Phase-0 form, with the publish gate added in 0.10) bumps every pinned literal in lockstep.
- `cd foxcode/channel && npm publish --access public` — script refuses to print «commit + tag» follow-ups until this succeeds (per gate added in P0.8).
- Tag `vX.Y.Z`, push, update marketplace pointer.
- Run validation matrix from DoD on a clean macOS profile and a clean Linux profile.
- Update PR description with matrix outcomes; merge only after all rows green.

### Out of Scope

- Switching the channel's transport (still WebSocket on localhost).
- Migrating away from Firefox / WebExtension Manifest V2.
- Codex hook-based `~/.codex/config.toml` rewriting (only invoked as Q1 fallback).
- JSR / non-npm registries for the channel.
- Refactoring `foxcode/channel/` internals beyond what the snippet shape change demands.

### Risks

- **Phase 0 stalls.** The publish pipeline has been silently dead for four months (see Investigation Evidence «Four-month publish gap»); restoring it touches auth, scope creation, version-baseline decisions, and CI. If any of D0.1–D0.5 cannot be answered confidently, Phase 0 — and therefore the whole task — blocks. Mitigation: D0.x explicitly require «record the chosen variant» in this document before P0.x steps run; no ambiguous deferrals. If Phase 0 is not green inside one working session, the working-tree code edits (rename, npx switch, plugin-src scaffolding) must NOT be committed — they ship a broken plugin without a valid pinned version.
- **Repeat-skip of `npm publish`.** Four months of bumping plugin SemVer without ever invoking `npm publish` is the proximate cause of this task existing. Mitigation: P0.8 adds a release-script gate that exits non-zero when the just-bumped version is missing from the registry, plus (optionally) P0.12 automates publish on tag push in CI. Until both are in place, every release runs the risk of skipping publish again.
- **Q1 negative (Codex forces MCP cwd to plugin root).** Then `process.cwd()` in the channel is the plugin cache, not the project dir, and `status` reports wrong scope. Fallback: a Codex `SessionStart` hook writes `~/.foxcode/codex-project-dir` and the channel reads it at first tool call. Implementation cost ≈ ½ day; design covered in superseded `codex-plugin-marketplace-payload.md` Open Questions.
- **Network outage on first user invocation.** `npx` prints its own stderr. No project-side hide. Acceptable per «fail fast, fail clearly».
- **`npx` cold start 300–1500 ms.** Future startups <100 ms. MCP host's own startup dominates total.
- **Out-of-order release.** Plugin tagged before `npm publish` = broken install. Release script enforces order; CI step fails the release if `npm publish` did not succeed.
- **Private npm registries that do not mirror unscoped names from the public registry.** Mitigation: README note pointing at `.npmrc` config. No project-side change.
- **Pinned literal drift across the six files.** Mitigation: release script writes all of them; reviewer checks the lockstep diff (commit must touch all bumped files together).
