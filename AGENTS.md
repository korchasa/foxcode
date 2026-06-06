# Core Project Rules
- Follow your assigned role strictly — it defines scope and boundaries for your actions.
- On first action in each session, read all project docs once — accurate context is a prerequisite for all work.
- After finishing a session, review all project documents to ensure they reflect the current state. Stale docs mislead future sessions.
- Verify every change by running appropriate tests or scripts — never assume correctness without evidence.
- Keep the project in a clean state: no errors, warnings, or issues in formatter and linter output. A broken baseline blocks all future work.
- Follow the TDD flow described below. Skipping it leads to untested code and regressions.
- Write all documentation in English, compressed style. Brevity preserves context window.
- If you see contradictions in the request or context, raise them explicitly, ask clarifying questions, and stop. Do not guess which interpretation is correct.
- Do not use stubs, workarounds, or deceptions to bypass checks — they hide real problems and create false confidence.
- Code should follow "fail fast, fail clearly" — surface errors immediately with clear messages rather than silently propagating bad state. Unless the user requests otherwise.
- When editing CI/CD pipelines, always validate locally first — broken CI is visible to the whole team and slow to debug remotely.
- Be precise in wording — use a scientific approach and accompany specialized terms and abbreviations with short hints in parentheses on first use.
- Provide evidence for your claims — link to code, docs, or tool output. Unsupported assertions erode trust.
- Use standard tools (jq, yq, jc) to process and manage structured output — they are portable and well-understood.
- Do not add fallbacks, default behaviors, or error recovery silently — if the user didn't ask for it, it's an assumption. If you believe a fallback is genuinely needed, ask the user first.
- Do not use tables in chat output — use two-level lists instead. Tables render poorly in terminal and are harder to scan.
- Always use relative paths in commands when possible — absolute paths only when required by the tool or context.
- **Verify before documenting external integrations**: Do not document how a third-party tool behaves (Codex, OpenCode, Claude Code plugin system) until you have empirical evidence (tool output, log, test result). Document the *observed* behavior, not the expected one. No `docs:` commit about external behavior without a quoted tool output confirming it.
- **No debug commits on main**: Experimental/probe commits (logging, temporary instrumentation, env-var existence checks) MUST go on a temp branch (`git checkout -b debug/...`). Never commit debug code to main. Delete the branch when done. Never force-push main to undo debug commits.

---

## Project Information
- Project Name: FoxCode

## Project Vision
Firefox WebExtension for browser automation via Claude Code, OpenCode, and Codex. Eval debug popup (on-demand, zero screen footprint) + headless browser API — via MCP server communicating over WebSocket. One-way: Agent -> Browser only.

## Project tooling Stack
- **Extension**: JavaScript (ES6+), HTML, CSS - Firefox WebExtension API (Manifest V2)
- **Channel Plugin**: Node.js (ES modules) - MCP server (distributed via `foxcode-channel` npm package)
- **Dependencies**: `@modelcontextprotocol/sdk`, `ws` (WebSocket)
- **Supported CLIs**: Claude Code CLI v2.1.80+ (`@anthropic-ai/claude-code`), OpenCode (`opencode`), Codex (`codex`)
- **Platform**: Cross-platform (macOS primary)

## Architecture
- **Channel Plugin** (`foxcode/channel/server.mjs`) - MCP server bridging Agent ↔ extension via WebSocket on `localhost:8787`
- **Popup Eval Console** (`foxcode/extension/popup/`) - On-demand eval debug UI: shows evalInBrowser requests/responses (browser_action popup, zero screen footprint)
- **Background Script** (`foxcode/extension/background/background.js`) - WebSocket connection management, eval message buffering, badge updates, tool request handling
- **Content Script** (`foxcode/extension/content/content-script.js`) - DOM access, `api.eval()` in page main world
- **Flow**: Agent (Claude Code / OpenCode / Codex) -> MCP stdio -> Channel Plugin -> WebSocket -> Background -> Popup (eval log)

## Repository Structure

```
foxcode/
├── .claude-plugin/       # CC Plugin Marketplace manifest
│   └── marketplace.json
├── foxcode/              # CC Plugin (installed via /plugin install)
│   ├── .claude-plugin/
│   │   └── plugin.json   #   Plugin manifest (name, version, author)
│   ├── skills/
│   │   ├── foxcode-run-project-profile/
│   │   │   └── SKILL.md  # Run skill — Project Profile (/foxcode:foxcode-run-project-profile)
│   │   └── foxcode-run-user-profile/
│   │       └── SKILL.md  # Run skill — User Profile (/foxcode:foxcode-run-user-profile)
│   ├── channel/           #   MCP channel plugin (Node.js, published as foxcode-channel)
│   │   ├── server.mjs    #     MCP server, WebSocket bridge, launchBrowser orchestration
│   │   ├── lib.mjs       #     Shared pure functions, tool definitions
│   │   ├── validator.mjs #     JS code validation for evalInBrowser
│   │   ├── launch/       #     Firefox lifecycle: discover, prepare, spawn, tool
│   │   ├── prepack.mjs   #     Pre-pack step: copies ../extension/ into ./extension/
│   │   └── package.json  #     Dependencies
│   ├── extension/        #   Firefox WebExtension (Manifest V2) — copied into channel tarball at publish
│   │   ├── background/   #     Background script, browser-api, dom-helpers
│   │   ├── popup/        #     Eval debug popup (HTML/CSS/JS)
│   │   ├── content/      #     Content script (DOM access, api.eval)
│   │   ├── icons/        #     Extension icon
│   │   └── manifest.json #     Extension manifest
│   └── .mcp.json         #   MCP server config (npx -y foxcode-channel@<pinned>)
├── opencode/             # OpenCode npm package (@korchasa/foxcode-opencode)
│   ├── index.mjs         #   Plugin entry: session.created hook (seed + snippet)
│   ├── bin/              #   CLI: foxcode-opencode setup|uninstall|doctor
│   ├── lib/              #   paths, seed-skills, mcp-snippet, patcher, exec, foxcode-mcp-entry, prereq, skill-frontmatter, setup
│   ├── prepack.mjs       #   Bundle assembly at npm-pack time (copies only ../foxcode/skills/; channel + extension resolved via npx foxcode-channel)
│   └── test/             #   Plugin + CLI + pack integration tests
├── plugin-src/           # Marketplace payload scaffolding (input for scripts/build-plugin-payload.mjs)
│   ├── claude/           #   CC marketplace.json + plugin.json templates
│   ├── codex/            #   Codex marketplace.json + plugin.json templates
│   └── shared/           #   Shared README packaged into both payloads
├── .agents/skills/       # Codex/Claude repo skills: launch wrappers, QA, usage analysis
├── .codex/config.toml    # Project-scoped Codex MCP server entry (foxcode)
├── documents/            # Project docs (SRS, SDS, whiteboards)
├── scripts/              # Dev scripts (check.sh, test.sh, dev.sh)
├── .mcp.json             # Dev-mode MCP config (local server.mjs)
└── AGENTS.md             # This file (CLAUDE.md -> symlink)
```

## Launch Modes

Install plugin: `/plugin marketplace add korchasa/foxcode` -> `/plugin install foxcode@korchasa`.

### Project Profile (`/foxcode:foxcode-run-project-profile`)
- Isolated Firefox instance launched via `web-ext run` with project-local profile (`.foxcode/firefox-profile/`)
- Connection URL: `http://localhost:PORT#PORT:PASSWORD` — info page (no secrets in HTML) + hash for extension auto-detect -> instant connection, no scanning
- Self-contained skill: checks prerequisites (Node.js ≥18, Firefox), locates extension, caches paths in `.foxcode/config.json`, launches Firefox, verifies connectivity via `status`
- Re-launch: run `/foxcode:foxcode-run-project-profile` again

### User Profile (`/foxcode:foxcode-run-user-profile`)
- Extension loaded into user's own Firefox via `about:debugging` -> Load Temporary Add-on -> `manifest.json`
- No port in URL -> extension uses saved sessions from `browser.storage.local`
- Self-contained skill: checks prerequisites, locates extension, guides manual loading, caches paths in `.foxcode/config.json`, verifies connectivity
- Temporary add-on: must re-load after Firefox restart

### Key Differences
- **Project Profile**: isolated Firefox, port known upfront (URL hash) -> instant connect. Persistent project-local profile
- **User Profile**: user's own Firefox, no port hint -> probe saved sessions. Temporary add-on
- **Multi-session**: extension maintains N simultaneous WebSocket connections (one per MCP server). Sessions identified by port
- **Reconnect**: per-session exponential backoff (3s -> 30s max, 10 attempts). Dead sessions removed automatically
- **WebSocket port**: both use range 8787–8886 (BASE_PORT=8787, PORT_RANGE=100), random start + saved in `~/.foxcode/port`. Override via `FOXCODE_PORT` env var

### Local Development (contributing to FoxCode)
- Root `.mcp.json` runs `cd foxcode/channel && npm ci && node server.mjs` with `FOXCODE_PROJECT_DIR="$PWD"` (relative to repo root)
- Extension loaded via `scripts/dev.sh` (`web-ext run --source-dir foxcode/extension/`) or manually via `about:debugging`
- CC: `claude --mcp-config .mcp.json`
- Workflow: edit code -> reload extension -> test
- Two foxcode MCP servers run simultaneously in dev sessions: `mcp__foxcode__` (dev mode, root `.mcp.json`, `pluginRoot: null`) and `mcp__plugin_foxcode_foxcode__` (plugin mode, CC plugin install, `pluginRoot: "~/.../marketplaces/..."`, `launchMode: "plugin"`). Use the latter to verify CC plugin runtime behaviour.

## Key Decisions
- MCP server over Native Messaging: no subprocess per request
- WebSocket on localhost: simple, reliable bridge between Node.js and browser extension
- Node.js for channel: MCP SDK compatibility, single process
- Manifest V2: broader Firefox compatibility
- Popup eval console: on-demand via browser_action icon click, zero persistent screen footprint. Shows only evalInBrowser requests/responses
- CC Plugin Marketplace for distribution: native install/update/versioning, auto-loads MCP server
- **MCP server distributed via npm, launched via `npx` across all IDEs**: channel source lives in `foxcode/channel/` (single source of truth) and is published as the unscoped npm package `foxcode-channel`. Every IDE plugin's MCP snippet has the same shape: `{ "command": "npx", "args": ["-y", "foxcode-channel@<pinned>"] }` with no `cwd` and no `env`. Marketplace/plugin payloads ship only static assets (skills + Firefox extension + the npx-pointing snippet). Active task: `documents/tasks/2026/06/unify-mcp-distribution-via-npx.md`. Rationale references: Codex MCP loader `codex-rs/core-plugins/src/loader.rs::normalize_plugin_mcp_server_value` (no `${…}` expansion in `command`/`args`/`env`, only relative `cwd` is normalised); hook env injection `codex-rs/hooks/src/engine/discovery.rs:219-228` (plugin env vars reach hooks, not MCP child processes). Pin exact version (no caret, no `latest`); release script bumps every pinned literal in lockstep; `npm publish` precedes plugin tag.
- CC plugin `.mcp.json` supports `${CLAUDE_PLUGIN_ROOT}` (plugin install dir) and `${CLAUDE_PLUGIN_DATA}` (persistent data dir `~/.claude/plugins/data/{id}/`). Standard env var expansion `${VAR}` also supported
- Plugin cache (`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`) is an isolated copy - only files from plugin dir are copied, `node_modules/` and files outside plugin dir are excluded. Dependencies must be installed at runtime
- Marketplace clone (`~/.claude/plugins/marketplaces/<name>/`) contains the full repo clone. With extension now inside `foxcode/`, both the plugin cache and the marketplace clone carry the extension — distribution no longer depends on the marketplace clone existing
- `CLAUDE_PLUGIN_ROOT` at runtime points to the **marketplace clone** plugin dir (`~/.../plugins/marketplaces/<marketplace>/<plugin>/`), NOT the plugin cache. Extension path: `Path(CLAUDE_PLUGIN_ROOT) / "extension"`. Verified via `mcp__plugin_foxcode_foxcode__status` → `pluginRoot` field. Before implementing code that reads `CLAUDE_PLUGIN_ROOT`, call that tool to confirm the actual value.
- Plugin tool permissions follow standard CC permission system (user approves on first use, no auto-allow for plugin MCP tools)
- URL-based connection with password auth: server generates random password (persisted in `~/.foxcode/password`, mode 0600), validates at HTTP upgrade level (401 on mismatch). Server serves info page at `http://localhost:PORT` (no secrets in HTML, shows project name + status). Password passed only in URL hash (`#PORT:PASSWORD`) which is never sent to server. Extension auto-connects via `tabs.onUpdated` listener. Multiple CC sessions coexist (different ports, shared password, N simultaneous WebSocket connections). No manual settings form — connections only via URL hash
- **Project dir source-of-truth**: channel resolves project dir via `resolveProjectDir(env)` in `foxcode/channel/lib.mjs` — returns `FOXCODE_PROJECT_DIR` if non-empty, else `process.cwd()`. Under the npx launch model, no IDE sets `cwd` in the plugin MCP snippet, so the MCP child inherits the user's session cwd and `process.cwd()` matches the project dir. `FOXCODE_PROJECT_DIR` remains as an explicit override (used by OpenCode `opencode.json` `{env:PWD}` interpolation when it ships).
- **Codex plugin env vars (PLUGIN_ROOT / CLAUDE_PLUGIN_ROOT)**: Codex sets these env vars ONLY for hook commands (event-driven). MCP server processes receive them empty — empirically confirmed via debug logging (issue [#19372](https://github.com/openai/codex/issues/19372)) and `codex-rs/hooks/src/engine/discovery.rs:219-228`. Resolution: do not depend on plugin env vars at MCP launch — use the npx-distributed channel (see «MCP server distributed via npm» decision above). The previous workaround (hand-rolled `[mcp_servers.foxcode]` entry in `~/.codex/config.toml` invoking `sh -c "...npm ci...node server.mjs"` with a version-agnostic glob over `~/.codex/plugins/cache/korchasa/foxcode/<ver>/channel`) is obsolete and removed from the installer/docs; README ships a one-line migration note pointing users to the two-line npx form.
- **Codex plugin hooks off by default**: Require `[features].plugin_hooks = true` in `~/.codex/config.toml`. Available events: `SessionStart`, `PreToolUse`, `PostToolUse`, `PermissionRequest`, `UserPromptSubmit`, `Stop`. No install-time (`ON_INSTALL`) hook exists.
- **Codex `[mcp_servers]` TOML**: `command` + `args` are passed to `execvp` directly (no shell). For the foxcode entry that means `command = "npx"`, `args = ["-y", "foxcode-channel@<pinned>"]` — no `$HOME`/`$PWD` expansion happens, so version pinning lives in the literal `args` string and bumps run via the lockstep release.
- **OpenCode `opencode.json` env interpolation**: Uses `{env:VAR}` syntax (e.g. `"FOXCODE_PROJECT_DIR": "{env:PWD}"`). Different from CC (`${VAR}`) and shell (`$VAR`).
- **Child stdio under MCP stdio transport**: any process the channel spawns (currently `web-ext run` via `foxcode/channel/launch/spawn.mjs`) MUST NOT inherit parent fd 1. fd 1 of `server.mjs` is the MCP JSON-RPC transport; `web-ext run` writes a `Running web extension from …` banner to stdout, which under `codex exec --experimental-json` corrupts framing and causes codex to close the transport — `server.mjs:332` `process.stdin.on('end', …)` then exits the channel and every subsequent MCP call returns `Transport closed`. Spawn children with stdio `['ignore', 'pipe', 'inherit']` and forward `child.stdout` to `process.stderr` so diagnostics stay visible without polluting MCP frames. Empirically observed in flowai-workflow `bug-hunter-on-prod` against `https://lumatale.com` on FoxCode `0.19.0`; diagnosis in `documents/tasks/2026/06/launchbrowser-closes-mcp-transport-under-codex-exec.md`.
- **Multi-session per folder shares ONE browser (folder-scoped registry + pong siblings)**: N MCP servers in the same project dir share a single Firefox. Discovery state lives ON DISK so it survives any process crash; recovery is driven by the next `launchBrowser` reading files, never by a live relayer. Mechanism (chosen over `fs.watch` push, peer unix-sockets, and extension port-scan — see `documents/tasks/2026/06/multi-session-shared-browser-per-folder.md`): (1) each server registers `{port, pid}` in `<projectDir>/.foxcode/sessions.json` on start (`foxcode/channel/launch/registry.mjs`; atomic temp+rename write, fail-soft `[]` read, dead-pid prune, idempotent self re-register → F4/F5), unregisters on clean shutdown; (2) the ping→pong path advertises live sibling ports via `pong.siblings` (`server.mjs` handleExtensionMessage, `lib.mjs::buildPongMessage`); (3) the extension re-pings every OPEN session every 5 s and connects to advertised siblings reusing the machine-global password (`background.js`). A healthy browser is NEVER killed on port mismatch — the old destructive kill is removed. Folder isolation: the registry is folder-scoped, so a folder's browser only ever learns same-folder ports (no cross-folder bleed); full port-range scanning was rejected for exactly this reason.
- **Owner lifecycle + orphan reap (the only sanctioned kill)**: Firefox lifetime is tied to the session that spawned it (the *owner*). The PID file `<projectDir>/.foxcode/web-ext.pid` now stores 3 lines — `browserPid`, `port`, `ownerPid` (`foxcode/channel/launch/spawn.mjs`; legacy 2-line files read `ownerPid:null` = healthy). Clean owner exit → `killProcessGroup` + PID file cleared. Owner HARD crash (SIGKILL/OOM) → `shutdown()` never runs → browser orphaned but ALIVE (web-ext does not auto-die with its parent). Recovery: the next `launchBrowser` reads the PID file; `browserPid` alive AND `ownerPid` DEAD ⇒ confirmed orphan ⇒ `killProcessGroup(browserPid)` + unlink ⇒ spawn fresh (F2). Requiring BOTH conditions bounds the pid-reuse risk (F7). Concurrent same-folder launches are serialized by a crash-safe lock `<projectDir>/.foxcode/launch.lock` (holder pid + mtime; dead holder or age > 60 s TTL ⇒ stale ⇒ reclaim, no deadlock — F6); the loser waits for the winner's browser to connect via discovery. All new diagnostics go to stderr only (fd 1 is the MCP transport).

## Documentation Hierarchy
1. **`AGENTS.md`**: Project vision, constraints, mandatory rules. READ-ONLY reference.
2. **SRS** (`documents/requirements.md`): "What" & "Why". Source of truth for requirements.
3. **SDS** (`documents/design.md`): "How". Architecture and implementation. Depends on SRS.
4. **Whiteboards** (`documents/tasks/<YYYY>/<MM>/<slug>.md`): Temporary plans/notes per task.
5. **`README.md`**: Public-facing overview. Installation, usage, quick start. Derived from AGENTS.md + SRS + SDS.

## Planning Rules

- **Environment Side-Effects**: Changes to infra/DB/external services -> plan MUST include migration/sync/deploy steps.
- **Verification Steps**: Plan MUST include specific verification commands (tests, validation tools, connectivity checks).
- **Functionality Preservation**: Refactoring/modifications -> run existing tests before/after; add new tests if coverage missing.
- **Data-First**: Integration with external APIs/processes -> inspect protocol & data formats BEFORE planning.
- **Architectural Validation**: Complex logic changes -> visualize event sequence (sequence diagram/pseudocode).
- **Variant Analysis**: Non-obvious path -> propose variants with Pros/Cons/Risks per variant + Trade-offs across variants. Quality > quantity. 1 variant OK if path is clear.
- **User Decision Gate**: Do NOT detail implementation plan until user explicitly selects a variant.
- **Plan Persistence**: After variant selection, save the detailed plan to `documents/tasks/<YYYY>/<MM>/<slug>.md` using GODS format. Chat-only plans are lost between sessions.
- **Proactive Resolution**: Before asking user, exhaust available resources (codebase, docs, web) to find the answer autonomously.
- **Verify Before Claiming Risk**: During critique/review, check verifiable facts (npm registry, GitHub releases, file existence, API docs) with tools before listing them as risks or open questions.
- **Verify Config Syntax**: Before using placeholders/variables in config files - check tool documentation for supported syntax. Do NOT write unverified syntax to files.
- **Distribution Audit**: When changing packaging/distribution - inspect target environment contents (plugin cache, Docker image, npm package) BEFORE implementing.

## TDD FLOW

1. **RED**: Write test (`test <id>`) for new/changed logic or behavior.
2. **GREEN**: Pass test (`test <id>`).
3. **REFACTOR**: Improve code/tests. No behavior change. (`test <id>`).
4. **CHECK**: `check` command. Fix all warnings and errors.

### Test Rules

- DO NOT test constants/templates. Test LOGIC/BEHAVIOR only.
- Tests in same pkg. Private methods OK.
- Code ONLY to fix tests/issues.
- NO STUBS. Real code.
- Run ALL tests before finish.
- When a test fails, fix the source code — not the test. Do not modify a failing test to make it pass, do not add error swallowing or skip logic.
- Do not create source files with guessed or fabricated data to satisfy imports — if the data source is missing, that is a blocker (see Diagnosing Failures).

## Diagnosing Failures

The goal is to identify the root cause, not to suppress the symptom. A quick workaround that hides the root cause is worse than an unresolved issue with a correct diagnosis.

1. Read the relevant code and error output before making any changes.
2. Apply "5 WHY" analysis to find the root cause.
3. Root cause is fixable → apply the fix, retry.
4. Second fix attempt failed → STOP. Output "STOP-ANALYSIS REPORT" (state, expected, 5-why chain, root cause, hypotheses). Wait for user help.

When the root cause is outside your control (missing API keys/URLs, missing generator scripts, unavailable external services, wrong environment configuration) → STOP immediately and ask the user for the correct values. Do not guess, do not invent replacements, do not create workarounds.

## Code Documentation

- **Module level**: each module gets an `AGENTS.md` describing its responsibility and key decisions.
- **Code level**: JSDoc for classes, methods, and functions. Focus on *why* and *how*, not *what*. Skip trivial comments — they add noise without value.

> **Before you start:** read `documents/requirements.md` (SRS) and `documents/design.md` (SDS) if you haven't in this session. They contain project requirements and architecture that inform every task.
