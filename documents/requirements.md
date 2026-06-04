# SRS

## 1. Intro
- **Desc:** FoxCode - Firefox WebExtension for browser automation via Claude Code, OpenCode, and Codex. Eval debug popup (on-demand, zero screen footprint) + headless browser API via MCP server over WebSocket.
- **Def/Abbr:**
  - CC: Claude Code (CLI tool)
  - Codex: OpenAI Codex CLI / IDE extension
  - Channel: MCP server exposing FoxCode tools to an agent session

## 2. General
- **Context:** Developer runs Claude Code, OpenCode, or Codex in IDE/terminal. Wants the agent to automate the browser. Eval debug popup shows evalInBrowser requests/responses on demand (zero screen footprint).
- **Assumptions/Constraints:**
  - Firefox 78.0+ required
  - At least one supported agent installed and running: Claude Code CLI v2.1.80+, OpenCode, or Codex
  - All communication local (localhost), no external servers
  - Cross-platform (macOS primary, Linux/Windows secondary)

## 3. Functional Reqs

### 3.1 FR-1: Eval Debug Popup
- **Desc:** On-demand popup (browser_action) displays evalInBrowser requests and responses. Zero screen footprint — opens only on icon click
- **Scenario:** CC calls evalInBrowser -> request/response appear in popup log. Badge shows unread eval count. User clicks icon -> sees eval history
- **Acceptance:**
  - [x] Popup shows tool_use and tool_result messages. Evidence: `foxcode/extension/popup/popup.js:78-97` (appendEvalMessage)
  - [x] Background buffers eval messages (200 cap FIFO) for popup replay. Evidence: `foxcode/extension/background/background.js:294-303` (bufferEvalMessage)
  - [x] Badge shows unread eval count, resets on popup open. Evidence: `foxcode/extension/background/background.js:305-309` (updateBadge), `foxcode/extension/background/background.js:327-330` (reset on connect)
  - [x] No persistent screen footprint (no sidebar). Evidence: `foxcode/extension/manifest.json` (browser_action, no sidebar_action)

### 3.2 FR-2: Send Messages [REMOVED]
- **Status:** Removed. Browser sidebar is now read-only display. No user input, no message sending from browser to CC.

### 3.3 FR-3: Page Context Injection [SUPERSEDED by FR-5]
- **Desc:** Send current page content or selected text as context into CC session
- **Scenario:** CC requests page content via MCP tool -> content delivered as context to active CC session
- **Acceptance:**
  - [x] Page content accessible to CC via `api.snapshot()` and `api.eval()` in `evalInBrowser`. Evidence: `foxcode/extension/background/browser-api.js:119-232` (DOM/query helpers), `foxcode/extension/content/content-script.js:7-21` (eval in page world)
  - [x] Content arrives in CC session as tool result. Evidence: `foxcode/channel/server.mjs:228-239` (evalInBrowser handler)

### 3.4 FR-4: Project Context
- **Desc:** Work from browser in context of a specific project directory
- **Scenario:** User selects project (cwd) -> CC session operates in that project's directory -> has access to project files, CLAUDE.md, git context
- **Acceptance:**
  - [x] User can specify/select project directory. Evidence: inherent - user runs `claude` from project dir
  - [x] CC session runs in chosen project context. Evidence: inherent - CC + channel plugin operate in cwd

### 3.5 FR-5: Browser Automation via evalInBrowser
- **Desc:** CC executes JS in browser via single `evalInBrowser` MCP tool. Agent writes code using `api` object with ~36 async helpers (+ storage sub-methods) for DOM, navigation, tabs, cookies, screenshots, storage. Replaces get_page_content/get_selected_text/get_page_url.
- **Scenario:** CC calls `evalInBrowser({code: "await navigate('...'); await fill('#email','x'); return await snapshot()"})` -> code runs in background script -> DOM ops delegated to tab via executeScript -> result returned to CC
- **Acceptance:**
  - [x] `evalInBrowser` MCP tool with `code` (string) + `timeout` (number, optional) params. Evidence: `foxcode/channel/lib.mjs:245-319` (TOOL_DEFINITIONS), `foxcode/channel/server.mjs:228-239` (handler)
  - [x] Code syntax validated before execution (async-aware). Evidence: `foxcode/channel/validator.mjs:5-12` (validateCode), `foxcode/channel/validator.test.mjs`
  - [x] Background script executes code via `new Function('api', ...)` with injected API object. Evidence: `foxcode/extension/background/background.js:260-272`
  - [x] API provides DOM helpers (click, fill, type, select, check, hover, waitFor, $, $$, snapshot). Evidence: `foxcode/extension/background/browser-api.js:47-60` (domAction helper), `foxcode/extension/background/browser-api.js:119-220` (api methods), `foxcode/extension/background/dom-helpers.js`
  - [x] DOM helpers auto-wait for element (poll 100ms, configurable timeout). Evidence: `foxcode/extension/background/dom-helpers.js:14-32` (buildWaitAndAct)
  - [x] Navigation helpers await page load via webNavigation.onCompleted. Evidence: `foxcode/extension/background/browser-api.js:236-272`
  - [x] `navigate()` creates new active tab on first call. Subsequent navigations reuse and activate managed tab. `closeTab()` resets state. Evidence: `foxcode/extension/background/browser-api.js:21-28,236-246,285-296`, `foxcode/extension/background/browser-api.test.js:364-548`
  - [x] Privileged helpers (screenshot, cookies, tabs, resize) call WebExtension APIs directly. Evidence: `foxcode/extension/background/browser-api.js:305-337`
  - [x] `api.eval(expr)` executes in page main world via wrappedJSObject. Evidence: `foxcode/extension/content/content-script.js:8-14`, `foxcode/extension/background/browser-api.js:224-232`
  - [x] Timeout (default 30s) via Promise.race. Evidence: `foxcode/extension/background/background.js:265-271`
  - [x] `reply` tool removed (IDE shows all CC output). Evidence: `foxcode/channel/lib.mjs` (2 tools: status, evalInBrowser)
  - [x] Old tools removed (get_page_content, get_selected_text, get_page_url, edit_message, reply). Evidence: `foxcode/channel/lib.mjs` (2 tools: status, evalInBrowser)
  - [x] Manifest updated: cookies, webNavigation, `<all_urls>` permissions + CSP unsafe-eval. Evidence: `foxcode/extension/manifest.json:6-11,13`
  - [x] Unit tests for validator, dom-helpers, browser-api. Evidence: `foxcode/channel/validator.test.mjs`, `foxcode/extension/background/dom-helpers.test.js`, `foxcode/extension/background/browser-api.test.js`
  - [~] Integration test: background executes code -> delegates to tab -> returns result (requires Firefox). Partial: Tier-4 IDE × real Firefox covers the round-trip. Evidence: `scripts/test-ide-skill.sh`, `opencode/test/acceptance/`. Still pending: a hermetic Tier-3 test without an IDE-driven harness.
  - [x] MCP instructions describe API reference, CSS-selector constraint, and text-matching examples. Evidence: `foxcode/channel/lib.mjs:264-317` (evalInBrowser description)

### 3.6 FR-6: Multi-Session Support
- **Desc:** Multiple concurrent CC sessions communicate with a single Firefox extension instance. Each session has its own MCP server on a unique port; extension maintains N simultaneous WebSocket connections.
- **Scenario:** User runs 2+ CC sessions with different projects -> each has its own MCP server -> extension connects to all -> popup shows eval messages from all sessions
- **Acceptance:**
  - [x] Extension maintains N WebSocket connections (one per MCP server). Evidence: `foxcode/extension/background/background.js:19` (sessions Map), `foxcode/extension/background/background.js:82-114` (connectToServer adds to Map)
  - [x] Eval messages from multiple sessions buffered and displayed. Evidence: `foxcode/extension/background/background.js:294-303` (bufferEvalMessage with sessionPort)
  - [x] `evalInBrowser` from any session, serialized via queue. Evidence: `foxcode/extension/background/background.js:236-289` (evalQueue + processEvalQueue)
  - [x] Dead session eval requests skipped (WS closed check before execution). Evidence: `foxcode/extension/background/background.js:253-258`
  - [x] New session auto-connects via URL hash (`tabs.onUpdated` listener). Evidence: `foxcode/extension/background/background.js:313-319`
  - [x] Per-session reconnect with exponential backoff (3s→30s, max 10 attempts). Evidence: `foxcode/extension/background/background.js:172-189` (scheduleReconnect)
  - [x] Dead sessions removed from Map after max reconnect attempts. Evidence: `foxcode/extension/background/background.js:177-182`
  - [x] `url-params.js` returns array of all matching tabs (deduplicated by port). Evidence: `foxcode/extension/background/url-params.js:41-57`
  - [x] Tests updated for array return type. Evidence: `foxcode/extension/background/url-params.test.js:67-116`
  - [~] Integration test: 2 MCP servers + 1 extension (requires Firefox). Multi-session protocol covered by `foxcode/extension/background/url-params.test.js` and acceptance harness in `opencode/test/acceptance/bridge.test.mjs`. Tier-3 hermetic 2-server scenario still pending.

### 3.7 FR-7: Disconnect Notifications
- **Desc:** Browser notification on critical connection state changes (disconnect after successful session, all reconnect attempts exhausted). No persistent UI — fires only on state transitions.
- **Scenario:** WebSocket drops while popup is closed -> browser shows system notification "FoxCode: session lost for project-x" -> user decides to re-run skill or investigate
- **Acceptance:**
  - [ ] `browser.notifications.create()` on disconnect after previously successful session
  - [ ] Notification on max reconnect attempts exhausted (10/10)
  - [ ] No notification spam: only on state transitions (connected→disconnected), not on each retry
  - [ ] Notification includes session name (project + port)

### 3.8 FR-8: Structured Eval Log
- **Desc:** Popup displays eval messages as structured cards (request + response grouped), with expand/collapse for long results and minimal JS syntax highlighting.
- **Scenario:** CC calls evalInBrowser -> popup shows request card with highlighted code + collapsible response. Long results (>200 chars) collapsed by default, expandable on click
- **Acceptance:**
  - [ ] Request + response grouped as single visual card
  - [ ] Expand/collapse for results >200 chars (collapsed by default, click to expand)
  - [ ] Minimal JS keyword highlighting in code (api.*, await, return)
  - [ ] Backward-compatible: still works with existing message buffer format

### 3.9 FR-9: Informative Session Names
- **Desc:** Session list shows `project_name:PORT` explicitly (not just basename). Color-coded per session for visual distinction in multi-session scenarios.
- **Scenario:** User has 2 CC sessions (project-a:8787, project-b:8788) -> popup shows both with distinct colors and full project:port labels without needing tooltip hover
- **Acceptance:**
  - [ ] Session label format: `project_name:PORT` (not just basename or localhost:PORT)
  - [ ] Deterministic color assignment per session (hash-based from port)
  - [ ] Color applied to session dot and/or name
  - [ ] Tooltip still shows full directory path

### 3.10 FR-10: Connection Page Quick-Start
- **Desc:** After extension connects, connection page (`http://localhost:PORT/`) shows actionable quick-start hint instead of just "You can close this tab".
- **Scenario:** Extension connects -> page updates to show "Connected. Try in Claude Code: `use evalInBrowser to get the page title`" -> user immediately knows how to use the tool
- **Acceptance:**
  - [ ] Quick-start hint shown after connection detected (replaces/supplements "close this tab" message)
  - [ ] Hint contains example evalInBrowser usage
  - [ ] Hint is contextual (mentions project name)

### 3.11 FR-11: Simplified User Profile Onboarding
- **Desc:** Reduce manual steps in User Profile launch skill. Auto-open `about:debugging`, provide copyable manifest path, replace "tell me when done" with automatic polling.
- **Scenario:** User runs `/foxcode:foxcode-run-user-profile` -> skill auto-opens `about:debugging#/runtime/this-firefox` -> shows copyable manifest.json path -> polls for connection automatically (no user confirmation needed)
- **Acceptance:**
  - [ ] Skill opens `about:debugging#/runtime/this-firefox` via shell command
  - [ ] Manifest.json absolute path provided as copyable string in user message
  - [ ] Automatic connection polling replaces "tell me when done" step
  - [ ] Fallback: if auto-open fails, falls back to current manual instructions

### 3.12 FR-12: Semantic Badge
- **Desc:** Badge differentiates normal activity from errors. Default color for successful evals, red/orange for errors. Count reflects requests only (not request+response mix).
- **Scenario:** CC sends 3 evalInBrowser calls, 1 fails -> badge shows "3" in default color, then changes to error color when failure result arrives
- **Acceptance:**
  - [ ] Badge counts tool_use only (not tool_use + tool_result)
  - [ ] Badge color: default (#c2185b) for normal, error color (red) when any buffered result contains error
  - [ ] Color resets to default when popup opened (along with count reset)

### 3.13 FR-13: Clear Log
- **Desc:** "Clear" button in popup header to remove all buffered eval messages.
- **Scenario:** User clicks Clear -> all messages removed from popup and buffer -> badge reset -> clean state for next eval cycle
- **Acceptance:**
  - [ ] Clear button in popup header (visible, small, non-intrusive)
  - [ ] Clears both popup DOM and background message buffer
  - [ ] Badge resets on clear
  - [ ] No confirmation dialog (instant action, low risk)

### 3.14 FR-14: Reconnect Progress
- **Desc:** Show reconnect attempt count and next retry time in session status instead of bare "(reconnecting…)".
- **Scenario:** WebSocket drops -> session shows "project-x (3/10, retry in 6s)" -> user sees progress and can decide to wait or re-run skill
- **Acceptance:**
  - [ ] Format: `"session_name (N/10, retry in Xs)"` during reconnect
  - [ ] Attempt counter and delay updated in real-time
  - [ ] After max attempts: `"session_name (disconnected)"` (final state, no more retries)
  - [ ] Background sends reconnect progress in session-update messages to popup

### 3.15 FR-15: Browser Launch via MCP
- **Description:** Firefox Project-Profile launch is owned by the MCP channel. The channel exposes a `launchBrowser` MCP tool that discovers Firefox + the bundled extension, prepares the Mozilla update cache, spawns `npx web-ext run` as an attached child, writes `.foxcode/web-ext.pid`, and waits for the extension to connect before returning. Firefox lifecycle is tied to the channel: SIGTERM/SIGINT/stdin-EOF on the channel terminates the web-ext process group. Skills collapse to two MCP calls (`status`, `launchBrowser`) — no Python helpers.
- **Tasks:** [move-browser-launch-to-mcp](tasks/2026/06/move-browser-launch-to-mcp.md), [fix-user-profile-extension-resolution](tasks/2026/06/fix-user-profile-extension-resolution.md)
- **Scenario:** Agent calls `status`; if `connectedClients == 0` calls `launchBrowser` with default arguments. Channel resolves Firefox + bundled extension, runs the macOS update preparation (purge staged markers + SIGTERM zombie `org.mozilla.updater` rows holding our URL), spawns web-ext with `--start-url http://localhost:PORT#PORT:PASS`. Extension connects via URL hash, the wss "connection" event resolves the pending `launchBrowser` call, agent sees `{status: "connected", pid, port}` and continues.
- **Acceptance:**
  - [x] `launchBrowser` tool exposed by the channel; blocks until first WS connection or returns `{status: "timeout"}` when the timeout elapses. Evidence: `foxcode/channel/lib.mjs` TOOL_DEFINITIONS, `foxcode/channel/launch/tool.test.mjs::blocks_until_waitForClient`
  - [x] `launchBrowser` is idempotent: concurrent calls share the in-flight promise; second call with the extension already attached returns `{status: "already-connected"}` without spawning. Evidence: `foxcode/channel/launch/tool.test.mjs::idempotent_second_call`
  - [x] Channel shutdown (SIGTERM/SIGINT/stdin-EOF) terminates the managed Firefox process group via `killProcessGroup`. Evidence: `foxcode/channel/server.mjs::shutdown`, `foxcode/channel/launch/spawn.test.mjs::killProcessGroup`
  - [x] macOS update preparation ported to Node — purges `update.status`/`update.version`/`update.mar`/`Updated.app`/`active-update.xml` and SIGTERMs `org.mozilla.updater` rows referencing our port. Logs counts only, never raw `ps` lines. Evidence: `foxcode/channel/launch/prepare.mjs`, `foxcode/channel/launch/prepare.test.mjs`
  - [x] Cross-platform Firefox discovery (macOS/Linux/Windows + PATH) ported. Evidence: `foxcode/channel/launch/discover.mjs::findFirefox`, `foxcode/channel/launch/discover.test.mjs::findFirefox`
  - [x] Bundled extension resolved via `import.meta.url` — no env vars, no handoff files; dev fallback resolves to `foxcode/extension/`, published fallback to `<channel>/extension/`. Evidence: `foxcode/channel/launch/discover.mjs::findExtensionDir`, `foxcode/channel/launch/discover.test.mjs::findExtensionDir`
  - [x] `foxcode-channel --launch-foreground` CLI flag enters supervised launch mode; SIGTERM/SIGINT triggers shutdown. Replaces `python3 launch_firefox.py --foreground` from `scripts/dev.sh`. Evidence: `foxcode/channel/server.mjs::LAUNCH_FOREGROUND_MODE`, `scripts/dev.sh`
  - [x] Skill `foxcode/skills/foxcode-run-project-profile/SKILL.md` collapses to two MCP tool calls (`status` + `launchBrowser`). Codex mirror updated. Evidence: `foxcode/skills/foxcode-run-project-profile/SKILL.md`, `.agents/skills/foxcode-run-project-profile/SKILL.md`
  - [x] Python launcher scripts deleted. Evidence: `foxcode/skills/foxcode-run-project-profile/scripts/` directory no longer exists (verified by `ls`)
  - [x] `status` MCP tool returns `extensionDir` (absolute path to the channel's bundled extension), resolved via the same `findExtensionDir()` used by `launchBrowser`. User-Profile skill consumes this field instead of any Python helper. Evidence: `foxcode/channel/server.mjs::status`, `foxcode/channel/lib.mjs` (`status` description names `extensionDir`), `foxcode/channel/lib.test.mjs::status description names extensionDir as a returned field`, `opencode/test/acceptance/mcp.test.mjs::channel status tool returns telemetry without browser connection`, `foxcode/skills/foxcode-run-user-profile/SKILL.md` Step 1

## 4. Non-Functional

### 4.1 NF-1: Easy Install via Claude Code Plugin [critical]
- **Desc:** Primary install/update path = CC Plugin Marketplace. Plugin auto-configures MCP server; self-contained launch skills handle prerequisites and Firefox setup. User should NOT need to read docs or edit configs manually.
- **Tasks:** [move-browser-launch-to-mcp](tasks/2026/06/move-browser-launch-to-mcp.md), [fix-user-profile-extension-resolution](tasks/2026/06/fix-user-profile-extension-resolution.md)
- **Scenario:** User runs `/plugin marketplace add korchasa/foxcode` -> `/plugin install foxcode@korchasa` -> `/foxcode:foxcode-run-project-profile` or `/foxcode:foxcode-run-user-profile` -> skill checks prereqs, locates extension, launches/guides Firefox setup, caches paths in `.foxcode/config.json` -> user launches CC with `--dangerously-load-development-channels plugin:foxcode@korchasa` -> done.
- **Acceptance:**
  - [x] Legacy `install-prompt.md` removed - plugin is the only install path. Evidence: file deleted
  - [x] Plugin marketplace structure: `.claude-plugin/marketplace.json` at repo root. Evidence: `.claude-plugin/marketplace.json`
  - [x] Plugin manifest: `foxcode/.claude-plugin/plugin.json`. Evidence: `foxcode/.claude-plugin/plugin.json`
  - [x] Plugin `.mcp.json` declares foxcode MCP server, installs channel deps with the `npm` paired with active `node`, and auto-loads on plugin enable. Evidence: `foxcode/.mcp.json`, `claude mcp list` -> `plugin:foxcode:foxcode ... ✓ Connected`
  - [x] `claude plugin validate .` passes. Evidence: validated locally, `claude plugin validate .` -> "Validation passed"
  - [x] Launch skills are self-contained: check prerequisites, locate extension, cache in `.foxcode/config.json`, launch/guide, verify. Evidence: `foxcode/skills/foxcode-run-project-profile/SKILL.md`, `foxcode/skills/foxcode-run-user-profile/SKILL.md`
  - [x] Skills check prerequisites: Node.js ≥18 (project profile), Firefox installed. Clear error with fix instructions per platform. Evidence: `foxcode/skills/foxcode-run-project-profile/SKILL.md` Step 3
  - [x] Two launch modes: **Project Profile** (isolated Firefox via web-ext) and **User Profile** (manual about:debugging). Evidence: `foxcode/skills/foxcode-run-project-profile/SKILL.md`, `foxcode/skills/foxcode-run-user-profile/SKILL.md`
  - [x] Firefox launch logic lives in the channel (`launchBrowser` MCP tool); Python helpers retired (see FR-15). Evidence: `foxcode/channel/launch/tool.mjs`, `foxcode/channel/launch/discover.mjs`, `foxcode/channel/launch/spawn.mjs`, `foxcode/channel/launch/prepare.mjs`
  - [x] Port/password for Firefox start-URL sourced exclusively from live MCP `status` (single source of truth). Stale `~/.foxcode/port` cannot produce wrong connect URL. Evidence: `foxcode/skills/foxcode-run-project-profile/SKILL.md` Step 1-2, `foxcode/skills/foxcode-run-user-profile/SKILL.md` Step 1
  - [x] Post-launch verification re-queries `status` on timeout; port/password drift from initial response surfaces as "server restarted" instead of generic failure. Evidence: `foxcode/skills/foxcode-run-project-profile/SKILL.md` Step 2 (`launchBrowser` reply interpretation), `foxcode/skills/foxcode-run-user-profile/SKILL.md` Step 3
  - [x] PID tracking prevents duplicate browser instances. Evidence: `foxcode/channel/launch/spawn.mjs` (`writePidFile`, `handleExistingProcess`), `foxcode/channel/launch/tool.mjs` (pid-file gating)
  - [x] Project-profile launch purges any staged macOS Firefox update markers (`update.status`, `update.version`, `update.mar`, `Updated.app`, `active-update.xml`) under `~/Library/Caches/Mozilla/updates/.../0/` and SIGTERMs any `org.mozilla.updater` process holding the FoxCode start URL, then proceeds to launch unconditionally. Evidence: `foxcode/channel/launch/prepare.mjs` (`purgeStagedUpdates`, `killStaleFoxcodeUpdaters`), `foxcode/channel/launch/prepare.test.mjs`
  - [x] Skills communicate in user's language (auto-detect from conversation context). Evidence: SKILL.md frontmatter
  - [x] On error: stops, explains what went wrong, suggests fix, does NOT silently skip steps. Evidence: SKILL.md Step 3

### 4.2 NF-2: Easy Launch [very important]
- [x] Zero extra processes: CC loads channel from .mcp.json automatically. Evidence: `.mcp.json`, tested
- [x] `status` tool returns server telemetry (port, clients, uptime, launchMode, client) without browser. Evidence: `foxcode/channel/server.mjs` (status handler)
- [x] `/foxcode:foxcode-run-project-profile` flow: status -> web-ext launch -> verify via status. Evidence: `foxcode/skills/foxcode-run-project-profile/SKILL.md`
- [x] `/foxcode:foxcode-run-user-profile` flow: status -> guide manual loading -> auto-open connection page -> poll & verify via status. Evidence: `foxcode/skills/foxcode-run-user-profile/SKILL.md`
- [x] Extension connects via URL hash (`#PORT:PASSWORD`) or saved sessions. No port scanning, no manual settings form. Evidence: `foxcode/extension/background/background.js` (connect flow), `foxcode/extension/background/url-params.js`

### 4.3 NF-3: Reliability [very important]
- [x] Per-session auto-reconnect with exponential backoff (3s → 30s max, 10 attempts). Evidence: `foxcode/extension/background/background.js:172-189` (scheduleReconnect)
- [x] Graceful degradation when no sessions: "No active sessions" banner in popup. Evidence: `foxcode/extension/popup/popup.js:43-52`, `foxcode/extension/popup/popup.html:9-12`
- [x] Background sends session-update to popup. Evidence: `foxcode/extension/background/background.js:191-203` (notifyPopupSessions)
- [x] Background pings all connected servers on popup connect. Evidence: `foxcode/extension/background/background.js:335-339`
- [ ] No message loss during normal operation - not verified
- [x] No interference with CC terminal workflow. Evidence: tested manually

### 4.4 NF-4: Simplicity [important]
- [x] Minimal moving parts: 1 MCP server + 1 extension, standard WebSocket protocol

### 4.5 NF-5: Security
- [x] All traffic local. Evidence: `foxcode/channel/lib.mjs` (createHttpServer binds 127.0.0.1)
- [x] WebSocket upgrade-level password auth: server generates random password (persisted `~/.foxcode/password`, mode 0600), rejects connections without valid `?token=` param (HTTP 401). Evidence: `foxcode/channel/server.mjs` (upgrade handler), `foxcode/channel/lib.mjs` (passwordStorage)
- [x] Session params (port+password array) saved in `browser.storage.local` for reconnection. Evidence: `foxcode/extension/background/background.js:43-49` (saveSessions)

### 4.6 NF-6: Performance
- [x] Message delivery latency <1s. Evidence: tested manually

### 4.7 NF-7: Easy Install in OpenCode [important]
- **Description:** Secondary install path = OpenCode plugin npm package (`@korchasa/foxcode-opencode`). User adds one entry to the `plugin` array in `opencode.json`; the package auto-seeds launch skills into `~/.config/opencode/skills/` and emits an MCP entry snippet for the user. The channel runtime and the Firefox extension are both resolved at MCP launch via `npx -y foxcode-channel@<pinned>` — no handoff files, no Python helpers. CLI fallback (`npx -y @korchasa/foxcode-opencode setup [--write-config]`) for one-shot install or CI.
- **Tasks:** [add-opencode-support](tasks/2026/05/add-opencode-support.md); npx-migration of the OpenCode MCP snippet tracked under [unify-mcp-distribution-via-npx](tasks/2026/06/unify-mcp-distribution-via-npx.md); extension-bundling shift tracked under [move-browser-launch-to-mcp](tasks/2026/06/move-browser-launch-to-mcp.md)
- **Scenario:** User runs `npx -y @korchasa/foxcode-opencode setup --write-config` from a project dir → CLI seeds skills, patches `opencode.json` with the `npx -y foxcode-channel@<pinned>` MCP entry → user starts OpenCode → runs `/foxcode-run-project-profile` → `evalInBrowser` round-trips against Firefox. Plugin route (no CLI): user adds `"plugin": ["@korchasa/foxcode-opencode"]` to `opencode.json`, OpenCode auto-installs via Bun, plugin runs on `session.created`, prints MCP snippet to stderr → user pastes snippet → restart → done.
- **Acceptance:**
  - [x] `opencode/` package layout: `package.json`, `index.mjs` (plugin entry), `lib/` (paths, seed-skills, mcp-snippet, patcher, exec, foxcode-mcp-entry, prereq, skill-frontmatter, setup), `bin/foxcode-opencode.mjs` (CLI), `prepack.mjs`, `test/`. Evidence: `ls opencode/`, `node --test opencode/lib/*.test.mjs opencode/test/*.test.mjs`
  - [x] Plugin seeds skills idempotently (`created` → `kept` → `replaced-dangling` → `user-dir-kept`). Evidence: `opencode/lib/seed-skills.test.mjs` (5 tests pass)
  - [x] Plugin emits MCP snippet to stderr exactly when `mcp.foxcode` is missing from project + global `opencode.json`. Evidence: `opencode/test/plugin.test.mjs` (`bootstrap seeds skills…`, `bootstrap stays quiet…`)
  - [x] CLI `setup` is idempotent (second run reports `kept`); `setup --write-config` patches plain JSON; refuses files with `//` or `/*` comments. Evidence: `opencode/test/cli.test.mjs` (6 tests pass)
  - [x] `opencode.json` patcher: surgical, idempotent (`created` / `added-mcp` / `added-foxcode` / `updated` / `noop`); refuses JSONC comments and non-object top-level shape. Evidence: `opencode/lib/patcher.test.mjs` (8 tests pass)
  - [x] Channel resolved at runtime via `npx -y foxcode-channel@<pinned>` — neither the plugin nor the CLI installs channel deps locally; the OpenCode MCP snippet emits a `command: ["npx", "-y", "foxcode-channel@…"]` array. Evidence: `opencode/lib/foxcode-mcp-entry.mjs`, `opencode/lib/foxcode-mcp-entry.test.mjs`
  - [x] `prepack.mjs` syncs version from `foxcode/.claude-plugin/plugin.json` and copies only `foxcode/skills/foxcode-run-{project,user}-profile/` into `bundle/skills/`. Neither the channel nor the Firefox extension is bundled — both ship inside `foxcode-channel` and are pulled from npm by `npx` at first launch. Evidence: `opencode/prepack.mjs`, `opencode/test/pack.test.mjs`
  - [x] Bundled SKILL.md files have valid OpenCode frontmatter (required `name`, `description`). Evidence: `opencode/lib/skill-frontmatter.test.mjs::real bundled skills (project + user profile) parse cleanly`
  - [x] CC plugin marketplace path ships skills + `foxcode/.mcp.json` (npx pin), no channel sources, no extension. Evidence: `foxcode/.mcp.json` declares `npx -y foxcode-channel@<pinned>`; `scripts/build-plugin-payload.mjs` sets `RUNTIME_DIRS = ['skills']`.
  - [x] Subprocess wrapper (`lib/exec.mjs`) uses `node:child_process.spawn` for cross-runtime support (Bun and Node). Evidence: `opencode/lib/exec.test.mjs`
  - [x] OpenCode command skill Tier-4 smoke launches real OpenCode, runs `foxcode-run-project-profile`, opens DuckDuckGo, and validates the third `foxcode` result via `evalInBrowser`. Evidence: `scripts/test-ide-skill.sh`, `npm run --prefix opencode test:e2e-skill`
  - [ ] End-to-end smoke test on macOS captured in PR (manual): install OpenCode → install plugin → run `/foxcode-run-project-profile` → run `evalInBrowser({code:'return await navigate("https://example.com")'})`. Evidence: PR transcript

### 4.8 NF-8: Project-Scoped Codex Support [important]
- **Description:** Codex CLI / IDE users can run and validate FoxCode from this repository without Claude Code plugin installation or OpenCode npm setup. Project-scoped MCP configuration starts the shared channel server, and repo-scoped skills expose launch plus release-validation workflows to Codex.
- **Tasks:** [unify-mcp-distribution-via-npx](tasks/2026/06/unify-mcp-distribution-via-npx.md) (active); [move-browser-launch-to-mcp](tasks/2026/06/move-browser-launch-to-mcp.md) (active); superseded by the unified-npx distribution: earlier `codex-plugin-marketplace-payload` and `distribute-channel-via-npm` plans (whiteboards removed).
- **Scenario:** User opens this repository in Codex → Codex trusts project config → `foxcode` MCP server starts from `.codex/config.toml` → user invokes `$foxcode-run-project-profile` → Firefox launches with the extension → `evalInBrowser` round-trips through the browser.
- **Acceptance:**
  - [x] Project-scoped Codex MCP config declares `foxcode` stdio server via the npm-distributed channel (`command = "npx"`, `args = ["-y", "foxcode-channel@<pinned>"]`). Evidence: `documents/design.md` § "Tertiary: Codex (NF-8)", `README.md` § "Install in Codex" (note: local `.codex/config.toml` is gitignored — canonical entry lives in user `~/.codex/config.toml`).
  - [x] Codex launch skills are discoverable from repo scope via `.agents/skills`, with `.claude/skills` symlinked to the same source to avoid duplicate skill files. Evidence: `.agents/skills/foxcode-run-project-profile/SKILL.md:1`, `.agents/skills/foxcode-run-user-profile/SKILL.md:1`, `.claude/skills`, `opencode/lib/skill-frontmatter.test.mjs:64`
  - [x] Codex launch skills reuse canonical FoxCode skill bodies instead of forking launch logic. Evidence: `.agents/skills/foxcode-run-project-profile/SKILL.md:8`, `.agents/skills/foxcode-run-user-profile/SKILL.md:8`, `foxcode/skills/foxcode-run-project-profile/SKILL.md:1`, `foxcode/skills/foxcode-run-user-profile/SKILL.md:1`
  - [x] Codex repo skills include acceptance, distribution, historical usage-analysis, and skill-layer QA workflows derived from observed project sessions. Evidence: `.agents/skills/foxcode-acceptance-testing/SKILL.md:1`, `.agents/skills/foxcode-distribution-testing/SKILL.md:1`, `.agents/skills/foxcode-usage-analysis/SKILL.md:1`, `.agents/skills/foxcode-usage-analysis/scripts/analyze_foxcode_usage.py:1`, `.agents/skills/foxcode-skill-qa/SKILL.md:1`, `.agents/skills/foxcode-skill-qa/references/scenarios.md:1`, `.agents/skills/foxcode-skill-qa/references/rubric.md:1`, `bash scripts/check.sh`
  - [x] Tier-4 acceptance includes Codex alongside Claude Code and OpenCode. Evidence: `opencode/test/acceptance/ide-task.test.ts:37`, `scripts/test-ide.sh:14`
  - [x] Codex plugin marketplace install path: `codex plugin marketplace add korchasa/foxcode` registers the marketplace and caches the payload under `~/.codex/plugins/cache/korchasa/foxcode/<version>/`. The cached payload now ships only static assets (skills + Firefox extension) — the MCP server is launched via the npm-distributed channel (`npx -y foxcode-channel@<pinned>`) declared in `~/.codex/config.toml`. Evidence: `scripts/codex-plugin-install.test.mjs`, `scripts/codex-plugin-payload.test.mjs`, `scripts/codex-plugin-mcp.test.mjs`.

### 4.9 NF-9: Self-Contained Plugin Payload [important]
- **Description:** Self-containment now lives in the `foxcode-channel` npm package, NOT in each IDE plugin's payload. The channel tarball bundles the Firefox extension at publish time (via `foxcode/channel/prepack.mjs`); IDE plugin payloads (CC marketplace, Codex marketplace, OpenCode npm) ship only skills + manifest + the MCP snippet pointing at `npx -y foxcode-channel@<pinned>`. The first `npx` invocation pulls down the channel and unlocks both the MCP server AND the extension assets in a single network hop.
- **Tasks:** [move-browser-launch-to-mcp](tasks/2026/06/move-browser-launch-to-mcp.md)
- **Scenario:** User installs the CC/Codex/OpenCode plugin payload (skills only, ~12 KB). On first `/foxcode:foxcode-run-project-profile` invocation the channel MCP server is resolved via npx; the channel exposes `launchBrowser`, finds the bundled extension via `import.meta.url`, and starts Firefox.
- **Acceptance:**
  - [x] `foxcode-channel` npm tarball bundles `extension/` via `prepack.mjs`. Evidence: `foxcode/channel/prepack.mjs`, `foxcode/channel/pack.test.mjs::bundles the Firefox extension via prepack`
  - [x] CC marketplace and Codex marketplace plugin payloads ship NO `extension/` directory. Evidence: `scripts/build-plugin-payload.mjs::RUNTIME_DIRS`, `scripts/codex-plugin-payload.test.mjs::payload does NOT ship channel/ or extension/ under unified-npx distribution`
  - [x] OpenCode `prepack.mjs` produces a skills-only bundle. Evidence: `opencode/prepack.mjs::main`, `opencode/test/pack.test.mjs::prepack assembles bundle/skills only`
  - [x] Channel resolves the extension dir via `import.meta.url` — no `CLAUDE_PLUGIN_ROOT`, no `~/.foxcode/opencode-plugin-dir` handoff. Evidence: `foxcode/channel/launch/discover.mjs::findExtensionDir`, `foxcode/channel/launch/discover.test.mjs`
  - [x] OpenCode plugin no longer writes `~/.foxcode/opencode-plugin-dir`. Evidence: `opencode/lib/setup.mjs` (no `writeHandoff` import), `opencode/lib/setup.test.mjs::runSetup seeds skills…no handoff file`

## 5. Interfaces
- **Transport:** Channel Plugin (MCP server inside supported agent) ↔ WebSocket localhost:8787 ↔ Firefox Extension
- **Extension APIs:** browser.browserAction, browser.runtime, browser.tabs, browser.cookies, browser.webNavigation, browser.windows
- **UI:** Popup eval debug console (browser_action, on-demand)

## 6. Acceptance
- **Criteria:**
  - [x] Extension loads in Firefox without errors
  - [x] Eval requests/responses visible in popup on demand
  - Removed: Messages sent from sidebar (FR-2 removed)
  - [x] Page content/selection delivered to CC session
  - [x] Supported agents can pull browser context from terminal
  - [x] Works with project-specific agent sessions
  - [x] Launch works via supported agent config: Claude Code plugin `.mcp.json`, OpenCode `opencode.json`, or Codex `.codex/config.toml`
