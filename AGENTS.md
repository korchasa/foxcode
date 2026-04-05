# YOU MUST

- STRICTLY FOLLOW YOUR ROLE.
- FIRST ACTION IN SESSION: READ ALL PROJECT DOCS. ONE-TIME PER SESSION.
- AFTER END OF SESSION, REVIEW ALL DOCUMENTS AND MAKE SURE THEY ARE ACCURATE AND UP TO DATE.
- ALWAYS CHECK THE CHANGES MADE BY RUNNING THE APPROPRIATE TESTS OR SCRIPTS.
- ALWAYS KEEP THE PROJECT IN WORKING CONDITION: WITHOUT ERRORS, WARNINGS, AND PROBLEMS IN THE FORMATER AND LINTER OUTPUT
- STRICTLY FOLLOW TDD RULES.
- WRITE ALL DOCUMENTATION IN ENGLISH IN COMPRESSED STYLE.
- IF YOU SEE CONTRADICTIONS IN THE REQUEST OR CONTEXT, SAY ABOUT THEM, ASK THE NECESSARY QUESTIONS AND STOP.
- DO NOT USE STUBS, "CRUTCHES", DECEPTIONS, OR OTHER PREMODS TO BYPASS CHECKS.
- THE CODE MUST FOLLOW THE "FAIL FAST, FAIL CLEARLY" STRATEGY UNLESS THE USER HAS REQUESTED OTHERWISE.
- IF A FIX ATTEMPT FAILS, APPLY "5 WHY" ANALYSIS TO FIND THE ROOT CAUSE BEFORE RETRYING.
- IF ROOT CAUSE IS UNFIXABLE OR OUTSIDE CONTROL: STOP. DO NOT USE WORKAROUNDS. ASK USER FOR HELP.
- IF ISSUE PERSISTS AFTER 2 ATTEMPTS: STOP. OUTPUT "STOP-ANALYSIS REPORT" (STATE, EXPECTED, 5-WHY CHAIN, ROOT CAUSE, HYPOTHESES). WAIT FOR USER HELP.
- WHEN EDITING CI/CD, ALWAYS CHECK LOCALLY FIRST.
- BE PRECISE IN YOUR WORDING. USE A SCIENTIFIC APPROACH. ACCOMPANY HIGHLY SPECIALIZED TERMS AND ABBREVIATIONS WITH SHORT HINTS IN PARENTHESES
- PROVIDE EVIDENCE FOR YOUR CLAIMS
- USE STANDARD TOOLS (jq, yq, jc) TO PROCESS AND MANAGE OUTPUT.
- DO NOT USE TABLES IN CHAT OUTPUT. USE TWO-LEVEL LIST INSTEAD.
- ALWAYS USE RELATIVE PATHS IN COMMANDS WHEN POSSIBLE. ABSOLUTE PATHS ONLY WHEN REQUIRED BY THE TOOL OR CONTEXT.

---

## Project Information
- Project Name: FoxCode

## Project Vision
Firefox WebExtension for browser automation via Claude Code. Eval debug popup (on-demand, zero screen footprint) + headless browser API — via MCP server communicating over WebSocket. One-way: CC -> Browser only.

## Project tooling Stack
- **Extension**: JavaScript (ES6+), HTML, CSS - Firefox WebExtension API (Manifest V2)
- **Channel Plugin**: Node.js (ES modules) - MCP server
- **Dependencies**: `@modelcontextprotocol/sdk`, `ws` (WebSocket)
- **CLI**: Claude Code CLI v2.1.80+ (`@anthropic-ai/claude-code`)
- **Platform**: Cross-platform (macOS primary)

## Architecture
- **Channel Plugin** (`foxcode/channel/server.mjs`) - MCP server bridging CC ↔ extension via WebSocket on `localhost:8787`
- **Popup Eval Console** (`extension/popup/`) - On-demand eval debug UI: shows evalInBrowser requests/responses (browser_action popup, zero screen footprint)
- **Background Script** (`extension/background/background.js`) - WebSocket connection management, eval message buffering, badge updates, tool request handling
- **Content Script** (`extension/content/content-script.js`) - DOM access, `api.eval()` in page main world
- **Flow**: Claude Code -> MCP stdio -> Channel Plugin -> WebSocket -> Background -> Popup (eval log)

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
│   ├── channel/           #   MCP channel plugin (Node.js)
│   │   ├── server.mjs    #     MCP server, WebSocket bridge
│   │   ├── lib.mjs       #     Shared pure functions, tool definitions
│   │   ├── validator.mjs #     JS code validation for evalInBrowser
│   │   └── package.json  #     Dependencies
│   └── .mcp.json         #   MCP server config (node ${CLAUDE_PLUGIN_ROOT}/channel/server.mjs)
├── extension/            # Firefox WebExtension (Manifest V2)
│   ├── background/       #   Background script, browser-api, dom-helpers
│   ├── popup/            #   Eval debug popup (HTML/CSS/JS)
│   ├── content/          #   Content script (DOM access, api.eval)
│   ├── icons/            #   Extension icon
│   └── manifest.json     #   Extension manifest
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
- Self-contained skill: checks prerequisites (Node.js ≥18, Firefox), locates extension, caches paths in `.foxcode/config.json`, launches Firefox, verifies connectivity via `status` + `ping`
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
- Extension loaded via `scripts/dev.sh` (`web-ext run --source-dir extension/`) or manually via `about:debugging`
- CC: `claude --mcp-config .mcp.json`
- Workflow: edit code -> reload extension -> test

## Key Decisions
- MCP server over Native Messaging: no subprocess per request
- WebSocket on localhost: simple, reliable bridge between Node.js and browser extension
- Node.js for channel: MCP SDK compatibility, single process
- Manifest V2: broader Firefox compatibility
- Popup eval console: on-demand via browser_action icon click, zero persistent screen footprint. Shows only evalInBrowser requests/responses
- CC Plugin Marketplace for distribution: native install/update/versioning, auto-loads MCP server
- Channel inside plugin dir (`foxcode/channel/`): bundled with plugin, no npm package. MCP server auto-installs deps on first run via `sh -c "npm ci && node server.mjs"`
- CC plugin `.mcp.json` supports `${CLAUDE_PLUGIN_ROOT}` (plugin install dir) and `${CLAUDE_PLUGIN_DATA}` (persistent data dir `~/.claude/plugins/data/{id}/`). Standard env var expansion `${VAR}` also supported
- Plugin cache (`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`) is an isolated copy - only files from plugin dir are copied, `node_modules/` and files outside plugin dir are excluded. Dependencies must be installed at runtime
- Marketplace clone (`~/.claude/plugins/marketplaces/<name>/`) contains the full repo clone including `extension/`. Used for `web-ext run`
- Plugin tool permissions follow standard CC permission system (user approves on first use, no auto-allow for plugin MCP tools)
- URL-based connection with password auth: server generates random password (persisted in `~/.foxcode/password`, mode 0600), validates at HTTP upgrade level (401 on mismatch). Server serves info page at `http://localhost:PORT` (no secrets in HTML, shows project name + status). Password passed only in URL hash (`#PORT:PASSWORD`) which is never sent to server. Extension auto-connects via `tabs.onUpdated` listener. Multiple CC sessions coexist (different ports, shared password, N simultaneous WebSocket connections). No manual settings form — connections only via URL hash
- CC does NOT expose project dir to MCP servers (`CLAUDE_PROJECT_DIR` unavailable). Workaround: `.mcp.json` shell command exports `FOXCODE_PROJECT_DIR="$PWD"` before `cd` to channel dir. `process.cwd()` in server ≠ user's project dir.
- When modifying MCP server env/cwd usage, always verify the actual shell command in `.mcp.json` - it may `cd` or modify env before `node` starts.

## Planning Rules

- **Environment Side-Effects**: Changes to infra/DB/external services -> plan MUST include migration/sync/deploy steps.
- **Verification Steps**: Plan MUST include specific verification commands (tests, validation tools, connectivity checks).
- **Functionality Preservation**: Refactoring/modifications -> run existing tests before/after; add new tests if coverage missing.
- **Data-First**: Integration with external APIs/processes -> inspect protocol & data formats BEFORE planning.
- **Architectural Validation**: Complex logic changes -> visualize event sequence (sequence diagram/pseudocode).
- **Variant Analysis**: Non-obvious path -> propose variants with Pros/Cons/Risks per variant + Trade-offs across variants. Quality > quantity. 1 variant OK if path is clear.
- **User Decision Gate**: Do NOT detail implementation plan until user explicitly selects a variant.
- **Plan Persistence**: After variant selection, save the detailed plan to `documents/whiteboards/<YYYY-MM-DD>-<slug>.md` using GODS format. Chat-only plans are lost between sessions.
- **Proactive Resolution**: Before asking user, exhaust available resources (codebase, docs, web) to find the answer autonomously.
- **Verify Before Claiming Risk**: During critique/review, check verifiable facts (npm registry, GitHub releases, file existence, API docs) with tools before listing them as risks or open questions.
- **Verify Config Syntax**: Before using placeholders/variables in config files - check tool documentation for supported syntax. Do NOT write unverified syntax to files.
- **Distribution Audit**: When changing packaging/distribution - inspect target environment contents (plugin cache, Docker image, npm package) BEFORE implementing.

## CODE DOCS

- **Module**: `AGENTS.md` (responsibility/decisions).
- **Comments**: Class/Method/Func (JSDoc/GoDoc). Why/How > What. No trivial comments.

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
