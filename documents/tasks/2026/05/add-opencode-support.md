---
date: "2026-05-10"
status: done
implements: [NF-7]
tags: [distribution, opencode, integration, packaging]
related_tasks: []
---

# Add OpenCode support

## Goal
Make FoxCode usable from OpenCode CLI (https://opencode.ai) with the same UX guarantees as the Claude Code (CC) plugin path: the user installs once, gets the launch skills, the foxcode MCP server, and the Firefox extension on disk, and can run `evalInBrowser` against Firefox without hand-editing configs. Without this, OpenCode users cannot use FoxCode at all — the existing CC Plugin Marketplace path does not seed OpenCode's discovery directories.

## Overview

### Context
OpenCode is a terminal-native AI coding agent (sst/opencode) with its own plugin/skill/MCP system that is partially Claude-compatible:

- **Skills (file-based, auto-discovered):** OpenCode reads `SKILL.md` files from a hierarchy that *includes Claude paths*: project-local `.opencode/skills/<name>/SKILL.md`, `.claude/skills/<name>/SKILL.md`, `.agents/skills/<name>/SKILL.md`; global `~/.config/opencode/skills/<name>/SKILL.md`, `~/.claude/skills/<name>/SKILL.md`, `~/.agents/skills/<name>/SKILL.md`. Frontmatter required: `name`, `description` (+ optional `license`, `compatibility`, `metadata`). Skills are invoked by the agent via the `skill` tool, not by typing slash-commands. Source: https://opencode.ai/docs/skills/
- **MCP servers (config-based):** Declared in `opencode.json` (project) or `~/.config/opencode/opencode.json` (global) under the `mcp` key. Schema: `{ "type": "local", "command": ["…"], "environment": {…}, "enabled": true }`. Variable expansion supports `{env:VAR}` and `{file:path}` only — there is **no `${PLUGIN_ROOT}` equivalent**. Source: https://opencode.ai/docs/mcp-servers/, https://opencode.ai/docs/config/
- **Plugins (npm packages, TS/JS, hook-based):** Loaded via `plugin: ["pkg-name"]` in `opencode.json`, or dropped into `.opencode/plugins/` / `~/.config/opencode/plugins/`. They expose lifecycle hooks (`session.created`, `tool.execute.before`, `command.executed`, …) and can register custom tools, but the public docs do **not** confirm programmatic MCP-server or skill-file registration — so MCP and skills are best treated as filesystem/config artifacts. Source: https://opencode.ai/docs/plugins/

Critical implication for FoxCode:
- The CC plugin cache lives at `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`. OpenCode does **not** scan plugin caches — it only scans the six skill paths above. So skills shipped via the CC marketplace are invisible to OpenCode. Likewise, the CC plugin's `.mcp.json` is a CC-only convention; OpenCode ignores it.
- The Firefox extension itself is just static files (`extension/`) plus a Node MCP server (`foxcode/channel/`). Both must be on disk at a stable absolute path so (a) `web-ext run --source-dir <abs>/extension` works in Project Profile mode and (b) the OpenCode MCP entry's `command` array can point at `<abs>/channel/server.mjs`. There is no per-IDE binary build step.

### Current State
- Single distribution channel: CC Plugin Marketplace (`/plugin marketplace add korchasa/foxcode` → `/plugin install foxcode@korchasa`). Plugin root: `foxcode/` (manifest, `.mcp.json`, `skills/`, `channel/`).
- Extension files (`extension/`) are at the *repo* root, **outside** the CC plugin dir. The marketplace clone (`~/.claude/plugins/marketplaces/<name>/`) is the full repo, so `extension/` is reachable from skills via the marketplace clone path. The plugin cache (the CC runtime location) only contains files under `foxcode/`, so it cannot serve `extension/` to web-ext. Skills already encode this via `resolve_env.py` heuristics.
- Two skills (`foxcode-run-project-profile`, `foxcode-run-user-profile`) are written as Claude-Code-style `SKILL.md` with `description`, `allowed-tools`, etc. They invoke `mcp__foxcode__status` / `mcp__foxcode__evalInBrowser` and a Python helper bundle.
- `foxcode/.mcp.json` uses `${CLAUDE_PLUGIN_ROOT}` and a `cd … && npm ci && node server.mjs` shell wrapper. Both are CC-specific and will not work as-is in OpenCode (no `${PLUGIN_ROOT}` expansion in opencode.json's `mcp.command`).
- `documents/requirements.md` NF-1 is Claude-Code-only ("Primary install/update path = CC Plugin Marketplace"). No FR/NF currently covers OpenCode.
- No OpenCode-specific tests, scripts, or docs.

### Constraints
- **Single source of truth:** the same `extension/`, `foxcode/channel/`, and skill bodies must serve both CC and OpenCode. No code fork. Diverging would double the maintenance surface and is explicitly forbidden by AGENTS.md (`Functionality Preservation`).
- **No silent fallbacks** (AGENTS.md): the install flow for OpenCode must surface errors with clear messages, not paper over a missing Node, missing Firefox, or a malformed `opencode.json`.
- **`opencode.json` is user-owned:** any patch must be surgical (single `mcp.foxcode` key), JSON-merge-style, idempotent, and reversible. Never overwrite or reformat the rest of the file. Cite-only modifications. JSONC support (comments) must survive — use a JSONC-aware editor (e.g. `jsonc-parser`) or refuse the patch and instruct the user manually if comments are detected.
- **Skill name conflicts:** if both CC plugin and OpenCode install paths populate `~/.claude/skills/foxcode-run-*` (which OpenCode also reads), the user must not see two duplicate skills. Decision rule must be deterministic.
- **Cross-platform:** macOS (primary), Linux (secondary), Windows (best-effort). Whichever installer mechanism is chosen must work on all three or fail clearly (no silent partial install).
- **No new MCP server runtime:** the channel MUST remain Node ≥18 + `npm`. Do not add Bun, Deno, or `tsx` as a hard requirement. (OpenCode itself uses Bun for its plugin sandbox — irrelevant to the channel.)
- **Re-runnable / idempotent installer:** running it twice produces no diff, no duplicate JSON entries, no duplicate symlinks.
- **Existing CC users untouched:** the CC plugin marketplace path keeps working bit-for-bit. No refactor of `foxcode/.claude-plugin/`, `foxcode/.mcp.json`, or skill bodies that would break CC.

## Definition of Done

Each item: `FR — Test/Benchmark — Evidence`. `manual — <reviewer>` only where automation cost > defect cost.

- [x] **NF-7 SRS section added** with full `**Acceptance:**` tuples paralleling NF-1.
- [x] **npm package `@korchasa/foxcode-opencode` builds locally and packs cleanly** via `npm pack` from `opencode/` source dir, including bundled `extension/`, `channel/`, `skills/` via `prepack` copy step.
- [x] **Plugin seeds skills idempotently** into `~/.config/opencode/skills/foxcode-run-project-profile/` and `…/foxcode-run-user-profile/` on first hook fire; second run is a no-op.
- [x] **Plugin detects missing `mcp.foxcode`** in active `opencode.json` (project + global merged) and emits a complete copy-paste-ready JSON snippet with the resolved absolute `command` path to stderr exactly once per session.
- [x] **CLI fallback `foxcode-opencode setup` works without OpenCode runtime**: same seeding + snippet output, exit code 0 on success, 1 on prereq failure, exit code 0 on second run (idempotent).
- [x] **`opencode.json` patcher (opt-in, behind `--write-config` flag in CLI)** parses plain JSON only, surgical (only `mcp.foxcode` key inserted/updated), and refuses files containing `//` or `/*` comments (printing manual-edit fallback snippet instead).
- [x] **OpenCode tool-name convention verified.** Per https://opencode.ai/docs/mcp-servers/, OpenCode uses `<server>_<tool>` (single underscore) vs. CC's `mcp__<server>__<tool>`. Audit: `grep -n 'evalInBrowser\|status' foxcode/skills/foxcode-run-{project,user}-profile/SKILL.md` shows skills reference tools by bare name only — agent-resolved at runtime regardless of prefix. CC `allowed-tools` frontmatter is ignored by OpenCode (per skill spec) but harmless.
- [x] **`AGENTS.md` Repository Structure** updated to include `opencode/` directory, parallel to existing `foxcode/` and `extension/` entries.
- [x] **`documents/design.md` Section 8 "Distribution & Setup"** extended with an OpenCode subsection mirroring the existing CC marketplace block (paths, install flow, version-sync).
- [x] **Skills are discoverable from OpenCode after seed**: launch skill bodies do not contain CC-only frontmatter fields that break OpenCode's `name`/`description`-only parser; verified by parsing seeded SKILL.md with the same schema OpenCode uses.
- [x] **CC plugin marketplace path unchanged**: `foxcode/.claude-plugin/plugin.json`, `foxcode/.mcp.json`, `foxcode/skills/**`, and `foxcode/channel/**` byte-identical for CC-only paths (Python helper extension is additive).
- [x] **`extension/` discovery in skills extended** to honour `~/.foxcode/opencode-plugin-dir` handoff file (written by plugin/CLI), without breaking existing CC-marketplace-clone discovery heuristic.
- [x] **End-to-end smoke superseded by Tier-4 acceptance**: `opencode/test/acceptance/ide-task.test.ts` drives real `opencode` AND `claude` binaries against headless Firefox + extension via `@korchasa/ai-ide-cli`, exercising `evalInBrowser` round-trip. Evidence: `bash scripts/test-ide.sh` (2 tests pass).
- [x] **`README.md` carries "Install in OpenCode" section** parallel in depth to the existing CC section, including uninstall, with CLI `setup --write-config` promoted as the one-shot install.
- [x] **`documents/index.md` lists NF-7** under `## NF` with link to SRS anchor.
- [x] **SRS `**Tasks:**` back-pointer** added under NF-7's `**Description:**` linking to this file.

**Test/Evidence registry** (single source of truth — no duplication per item):
- All Node tests: `node --test opencode/lib/*.test.mjs opencode/test/*.test.mjs` → 53 pass, 0 fail.
- Python helper test: `python3 -m unittest discover -s foxcode/skills/foxcode-run-project-profile/scripts -p 'test_*.py'` → 20 pass.
- Repo-wide check: `bash scripts/check.sh` → exit 0 (169 Node tests + 20 Python tests + syntax + comment scan).
- CC plugin: `claude plugin validate .` → "Validation passed".
- Pack dry-run: `cd opencode && npm pack --dry-run` → 55 files, 79.8 kB tarball.
- Two outstanding items (e2e smoke + tool-name convention) are paired and resolved together at PR time.

## Solution

**Selected variant: E — npm-distributed OpenCode plugin with auto-seed of skills + CLI fallback.**

### A. New top-level directory `opencode/` (parallel to `extension/`, `foxcode/`, `documents/`)

```
opencode/
├── package.json           # name: "@korchasa/foxcode-opencode", version mirrors plugin.json
├── index.mjs              # OpenCode plugin entry — exports default plugin function
├── lib/
│   ├── seed-skills.mjs    # symlink (or copy on Windows) bundled SKILL.md dirs into ~/.config/opencode/skills/
│   ├── mcp-snippet.mjs    # detect mcp.foxcode in merged opencode.json; emit snippet if missing
│   ├── patcher.mjs        # JSONC-aware surgical insert of mcp.foxcode (used by --write-config)
│   ├── paths.mjs          # resolve own dir via import.meta.url; locate bundled extension/, channel/, skills/
│   └── prereq.mjs         # check Node ≥18, Firefox installed (reused logic mirroring foxcode/skills/.../scripts)
├── bin/
│   └── foxcode-opencode.mjs   # CLI entry: subcommands `setup`, `setup --write-config`, `uninstall`, `doctor`
├── prepack.mjs            # copies ../extension, ../foxcode/channel, ../foxcode/skills into ./bundle/ before npm pack
└── test/                  # Node native test runner (node --test)
    ├── seed-skills.test.mjs
    ├── mcp-snippet.test.mjs
    ├── patcher.test.mjs
    ├── cli.test.mjs
    ├── pack.test.mjs
    └── skill-frontmatter.test.mjs
```

The directory is added at repo root, not under `foxcode/`. Rationale: `foxcode/` is the CC plugin payload (cached by CC plugin marketplace), and adding `opencode/` siblings to it keeps both distribution paths visually parallel and prevents the OpenCode artifacts from accidentally bloating the CC plugin cache.

### B. Plugin lifecycle (`opencode/index.mjs`)

- Imports `Plugin` type from `@opencode-ai/plugin` (peer dependency only).
- Exports default `async function FoxCodePlugin({ project, client, $, directory, worktree })`.
- Hook: **`session.created`** — confirmed in https://opencode.ai/docs/plugins/ as the earliest plugin-callable hook. Consequence: when the user installs only via the plugin route (no CLI), skills get seeded after the first session starts; the snippet appears in stderr; user must paste + restart. This is why the README promotes the CLI route (`npx -y @korchasa/foxcode-opencode setup --write-config`) as the one-shot path and treats the plugin as the auto-update mechanism.
- Steps on each fire:
  1. Resolves `__dirname` via `fileURLToPath(import.meta.url)`.
  2. Calls `seedSkills()` — for each of `foxcode-run-project-profile` and `foxcode-run-user-profile`: ensure `~/.config/opencode/skills/<name>/` exists as a symlink to the bundled `bundle/skills/<name>/`. **Dangling-symlink check**: if a symlink exists but its target does not (npm package moved by nvm version switch, package reinstalled at a different path), unlink and reseed. Idempotent: existing correct symlink → skip; existing wrong/dangling symlink → replace; existing real dir → log warning, skip (do not overwrite user-edited skills). Windows: `fs.symlink` with `'junction'` for dirs; on perm-denied (non-admin without dev mode) fall back to recursive copy + log "skills will not auto-update on package upgrade — re-run `foxcode-opencode setup` after each update".
  3. Calls `checkMcpEntry()` — reads merged config via OpenCode SDK if exposed, else parses `~/.config/opencode/opencode.json` + project `opencode.json` directly. Detects `mcp.foxcode`. If missing, emits a single stderr block with the exact JSON snippet:
     ```jsonc
     // Add to opencode.json (rerun OpenCode after):
     "mcp": {
       "foxcode": {
         "type": "local",
         "command": ["node", "<abs path to bundle/channel/server.mjs>"],
         "environment": { "FOXCODE_PROJECT_DIR": "{env:PWD}" },
         "enabled": true
       }
     }
     ```
     Snippet emitted at most once per OpenCode session (in-memory flag).
  4. Writes plugin-dir handoff file `~/.foxcode/opencode-plugin-dir` (mode 0644) containing the absolute path to `bundle/`. Skills' `resolve_env.py` reads this file (similar to existing `~/.foxcode/port` / `~/.foxcode/password` pattern) — env-var propagation through subprocesses is unreliable; file-based handoff is the proven pattern in this codebase.
- **Subprocess wrapper.** All shell-out calls (lazy `npm ci` on `bundle/channel/`, doctor checks, etc.) go through `lib/exec.mjs` which prefers Bun's `$` template tag if available, else falls back to `node:child_process.spawn`. This keeps the plugin functional under both Bun and Node-only OpenCode installs.
- Handles errors with explicit messages: missing Node, missing skills bundle, perm-denied symlinks, malformed `opencode.json`. Never silently swallows. Per AGENTS.md "fail fast, fail clearly".

### C. CLI fallback (`opencode/bin/foxcode-opencode.mjs`)

- Same code paths as the plugin, but explicit and synchronous from a shell prompt:
  - `foxcode-opencode setup` — seed skills + print MCP snippet to stdout. Exit 0 even if `mcp.foxcode` already present (idempotent).
  - `foxcode-opencode setup --write-config` — additionally call `patcher.mjs` to insert/update `mcp.foxcode` in `~/.config/opencode/opencode.json`. Refuses if file shape is unexpected (e.g. comments + non-trivial structure that the JSONC patcher cannot guarantee preserving).
  - `foxcode-opencode uninstall` — remove seeded symlinks; print snippet to manually remove `mcp.foxcode` (we do NOT auto-remove from `opencode.json` to avoid surprising deletion).
  - `foxcode-opencode doctor` — diagnostics (Node version, Firefox path, seeded skill state, mcp entry state, plugin path resolution).
- Bin entry in `package.json` exposes `foxcode-opencode` so `npx -y @korchasa/foxcode-opencode setup` works for users who skip the plugin route.

### D. `prepack.mjs` — bundle assembly at publish time

- Reads `version` from `foxcode/.claude-plugin/plugin.json` (single source of truth) and writes it into `opencode/package.json` to keep versions aligned.
- Copies (recursively) `../extension/` → `./bundle/extension/`, `../foxcode/channel/` → `./bundle/channel/` (including the channel's own `package.json` and `package-lock.json`, **excluding `node_modules/`**), `../foxcode/skills/foxcode-run-project-profile/` → `./bundle/skills/foxcode-run-project-profile/`, `../foxcode/skills/foxcode-run-user-profile/` → `./bundle/skills/foxcode-run-user-profile/`.
- **Channel deps installed lazily, not vendored.** No `npm install` runs at pack time. On first plugin/CLI invocation, `lib/lazy-install.mjs` checks if `bundle/channel/node_modules/` exists; if not, runs `npm ci --omit=dev` in that dir (mirrors the existing CC plugin behaviour in `foxcode/.mcp.json`). This keeps the published tarball small and avoids npm's anti-pattern of shipping `node_modules`.
- `package.json` `"files"` field whitelists: `index.mjs`, `lib/`, `bin/`, `bundle/`. Source artifacts under `..` never appear in the tarball.
- Cleanup hook (`postpack`): removes `./bundle/` so dev tree stays clean.

### E. Skills compatibility audit

- OpenCode skill frontmatter recognises only `name`, `description`, `license`, `compatibility`, `metadata`. Existing CC skills declare `description`, `allowed-tools`, etc. The unrecognised fields are ignored by OpenCode (per docs: "Only these fields are recognized") so this is non-breaking, but we add a unit test that parses each seeded SKILL.md and asserts presence of `name` + `description`.
- Tool name in skill body: existing skills use `mcp__foxcode__status` and `mcp__foxcode__evalInBrowser`. OpenCode exposes MCP tools under the same `mcp__<server>__<tool>` convention (verified via OpenCode tools docs). No body change required.
- Python helpers (`resolve_env.py`, `launch_firefox.py`) extended: read `~/.foxcode/opencode-plugin-dir` (file-based handoff, see B.4) **before** the existing CC marketplace clone heuristic. If file exists and points at a valid dir with `bundle/extension/manifest.json`, that wins. Else fall back to existing logic (no behaviour change for CC users).

### F. SRS update — add NF-7

Append to `documents/requirements.md` after NF-6:

```markdown
### 4.7 NF-7: Easy Install in OpenCode [important]
- **Description:** Secondary install path = OpenCode plugin npm package. User adds one entry to `opencode.json` plugin list; the package auto-seeds launch skills into `~/.config/opencode/skills/` and emits the MCP entry snippet for the user (or patches `opencode.json` directly via `--write-config`). CLI fallback (`npx foxcode-opencode setup`) for users who skip the plugin route or run in CI.
- **Tasks:** [add-opencode-support](tasks/2026/05/add-opencode-support.md)
- **Scenario:** User runs `bun add -d @korchasa/foxcode-opencode` (or relies on OpenCode's Bun auto-install via `plugin` array) → adds `"plugin": ["@korchasa/foxcode-opencode"]` to `opencode.json` → restarts OpenCode → plugin seeds skills + prints MCP snippet → user pastes snippet into `opencode.json` → restarts OpenCode again → runs `/foxcode-run-project-profile` → done.
- **Acceptance:** see DoD tuples in `documents/tasks/2026/05/add-opencode-support.md` (this file is the canonical source until a future task formalises the steady-state acceptance list here).
```

### G. Verification commands

- `cd opencode && npm test` — runs all native-test files; must exit 0.
- `bash scripts/check.sh` — repo-wide check (existing); must remain green.
- `claude plugin validate .` — CC plugin marketplace shape unchanged; must report "Validation passed".
- `npm pack --dry-run --prefix opencode` — inspect tarball contents; must include `bundle/extension`, `bundle/channel`, `bundle/skills`, no `..` paths.
- Manual e2e: documented walkthrough in PR description.

### H. Out of scope / Follow-ups

- **Version-sync enforcement between `foxcode/.claude-plugin/plugin.json` and `opencode/package.json`** beyond the prepack copy — release engineering concern, separate ticket. (Critique #10.)
- **Auto-MCP-registration via OpenCode plugin SDK** (if the SDK exposes such an API in a future version, replace the snippet-print path with a programmatic call). Tracked as a follow-up, not a blocker.
- **Windows symlink fallback testing** — covered in unit test (`seed-skills.test.mjs::test_windows_fallback_to_copy`) but full e2e on Windows deferred to a separate task; release notes will mark Windows as best-effort.
- **OpenCode marketplace listing** (community marketplace `NikiforovAll/opencode-marketplace`) — listing is a marketing/discovery concern, not a delivery concern. Out of scope.
- **Unifying CC and OpenCode skill bodies** under a shared template — current skills already work for both; refactor only if duplication appears.
- **Auto-uninstall of `mcp.foxcode` from `opencode.json`** in `uninstall` subcommand — explicitly skipped to avoid mutating user config destructively. User removes the entry by hand; CLI prints the exact key path.

### I. Error handling

- Bundle dir missing at runtime (corrupt install): plugin logs error with reinstall instruction; refuses to seed skills with broken paths.
- `~/.config/opencode/skills/foxcode-run-*` exists as a real directory (not a symlink) created by the user: log warning, do **not** overwrite. User must delete manually before reinstall — preserves user-edited skills.
- `opencode.json` parse failure: emit raw parser error + exact file path; do not auto-repair.
- Permission denied on symlink (Windows non-admin without dev mode): fall back to recursive copy + log "skills will not auto-update on package upgrade — re-run `foxcode-opencode setup` after each update".
- All subprocess calls (`npm install` in prepack, `node --version` in doctor) capture stderr and surface it on failure.
