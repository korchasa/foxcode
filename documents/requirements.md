# SRS

## 1. Intro
- **Desc:** FoxCode - Firefox WebExtension for browser automation via Claude Code. Eval debug popup (on-demand, zero screen footprint) + headless browser API via MCP server over WebSocket.
- **Def/Abbr:**
  - CC: Claude Code (CLI tool)
  - Channel: MCP server pushing events into a CC session

## 2. General
- **Context:** Developer runs Claude Code in IDE/terminal. Wants CC to automate the browser. Eval debug popup shows evalInBrowser requests/responses on demand (zero screen footprint).
- **Assumptions/Constraints:**
  - Firefox 78.0+ required
  - Claude Code CLI v2.1.80+ installed and running
  - All communication local (localhost), no external servers
  - Cross-platform (macOS primary, Linux/Windows secondary)

## 3. Functional Reqs

### 3.1 FR-1: Eval Debug Popup
- **Desc:** On-demand popup (browser_action) displays evalInBrowser requests and responses. Zero screen footprint — opens only on icon click
- **Scenario:** CC calls evalInBrowser -> request/response appear in popup log. Badge shows unread eval count. User clicks icon -> sees eval history
- **Acceptance:**
  - [x] Popup shows tool_use and tool_result messages. Evidence: `extension/popup/popup.js:78-97` (appendEvalMessage)
  - [x] Background buffers eval messages (200 cap FIFO) for popup replay. Evidence: `extension/background/background.js:294-303` (bufferEvalMessage)
  - [x] Badge shows unread eval count, resets on popup open. Evidence: `extension/background/background.js:305-309` (updateBadge), `extension/background/background.js:327-330` (reset on connect)
  - [x] No persistent screen footprint (no sidebar). Evidence: `extension/manifest.json` (browser_action, no sidebar_action)

### 3.2 FR-2: Send Messages [REMOVED]
- **Status:** Removed. Browser sidebar is now read-only display. No user input, no message sending from browser to CC.

### 3.3 FR-3: Page Context Injection [SUPERSEDED by FR-5]
- **Desc:** Send current page content or selected text as context into CC session
- **Scenario:** CC requests page content via MCP tool -> content delivered as context to active CC session
- **Acceptance:**
  - [x] Page content accessible to CC via `api.snapshot()` and `api.eval()` in `evalInBrowser`. Evidence: `extension/background/browser-api.js:100-253` (DOM/query helpers), `extension/content/content-script.js:7-21` (eval in page world)
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
  - [x] Background script executes code via `new Function('api', ...)` with injected API object. Evidence: `extension/background/background.js:260-272`
  - [x] API provides DOM helpers (click, fill, type, select, check, hover, waitFor, $, $$, snapshot). Evidence: `extension/background/browser-api.js:100-253`, `extension/background/dom-helpers.js`
  - [x] DOM helpers auto-wait for element (poll 100ms, configurable timeout). Evidence: `extension/background/dom-helpers.js:14-32` (buildWaitAndAct)
  - [x] Navigation helpers await page load via webNavigation.onCompleted. Evidence: `extension/background/browser-api.js:257-267`
  - [x] `navigate()` creates new active tab on first call. Subsequent navigations reuse and activate managed tab. `closeTab()` resets state. Evidence: `extension/background/browser-api.js:21-28,257-267,306-317`, `extension/background/browser-api.test.js:364-548`
  - [x] Privileged helpers (screenshot, cookies, tabs, resize) call WebExtension APIs directly. Evidence: `extension/background/browser-api.js:326-358`
  - [x] `api.eval(expr)` executes in page main world via wrappedJSObject. Evidence: `extension/content/content-script.js:8-14`, `extension/background/browser-api.js:245-253`
  - [x] Timeout (default 30s) via Promise.race. Evidence: `extension/background/background.js:265-271`
  - [x] `reply` tool removed (IDE shows all CC output). Evidence: `foxcode/channel/lib.mjs` (2 tools: status, evalInBrowser)
  - [x] Old tools removed (get_page_content, get_selected_text, get_page_url, edit_message, reply). Evidence: `foxcode/channel/lib.mjs` (2 tools: status, evalInBrowser)
  - [x] Manifest updated: cookies, webNavigation, `<all_urls>` permissions + CSP unsafe-eval. Evidence: `extension/manifest.json:6-11,13`
  - [x] Unit tests for validator, dom-helpers, browser-api. Evidence: `foxcode/channel/validator.test.mjs`, `extension/background/dom-helpers.test.js`, `extension/background/browser-api.test.js`
  - [ ] Integration test: background executes code -> delegates to tab -> returns result (requires Firefox)
  - [x] MCP instructions describe API reference. Evidence: `foxcode/channel/lib.mjs:264-303` (evalInBrowser description)

### 3.6 FR-6: Multi-Session Support
- **Desc:** Multiple concurrent CC sessions communicate with a single Firefox extension instance. Each session has its own MCP server on a unique port; extension maintains N simultaneous WebSocket connections.
- **Scenario:** User runs 2+ CC sessions with different projects -> each has its own MCP server -> extension connects to all -> popup shows eval messages from all sessions
- **Acceptance:**
  - [x] Extension maintains N WebSocket connections (one per MCP server). Evidence: `extension/background/background.js:19` (sessions Map), `extension/background/background.js:82-114` (connectToServer adds to Map)
  - [x] Eval messages from multiple sessions buffered and displayed. Evidence: `extension/background/background.js:294-303` (bufferEvalMessage with sessionPort)
  - [x] `evalInBrowser` from any session, serialized via queue. Evidence: `extension/background/background.js:236-289` (evalQueue + processEvalQueue)
  - [x] Dead session eval requests skipped (WS closed check before execution). Evidence: `extension/background/background.js:253-258`
  - [x] New session auto-connects via URL hash (`tabs.onUpdated` listener). Evidence: `extension/background/background.js:313-319`
  - [x] Per-session reconnect with exponential backoff (3s→30s, max 10 attempts). Evidence: `extension/background/background.js:172-189` (scheduleReconnect)
  - [x] Dead sessions removed from Map after max reconnect attempts. Evidence: `extension/background/background.js:177-182`
  - [x] `url-params.js` returns array of all matching tabs (deduplicated by port). Evidence: `extension/background/url-params.js:41-57`
  - [x] Tests updated for array return type. Evidence: `extension/background/url-params.test.js:67-116`
  - [ ] Integration test: 2 MCP servers + 1 extension (requires Firefox)

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

## 4. Non-Functional

### 4.1 NF-1: Easy Install via Claude Code Plugin [critical]
- **Desc:** Primary install/update path = CC Plugin Marketplace. Plugin auto-configures MCP server; self-contained launch skills handle prerequisites and Firefox setup. User should NOT need to read docs or edit configs manually.
- **Scenario:** User runs `/plugin marketplace add korchasa/foxcode` -> `/plugin install foxcode@korchasa` -> `/foxcode:foxcode-run-project-profile` or `/foxcode:foxcode-run-user-profile` -> skill checks prereqs, locates extension, launches/guides Firefox setup, caches paths in `.foxcode/config.json` -> user launches CC with `--dangerously-load-development-channels plugin:foxcode@korchasa` -> done.
- **Acceptance:**
  - [x] Legacy `install-prompt.md` removed - plugin is the only install path. Evidence: file deleted
  - [x] Plugin marketplace structure: `.claude-plugin/marketplace.json` at repo root. Evidence: `.claude-plugin/marketplace.json`
  - [x] Plugin manifest: `foxcode/.claude-plugin/plugin.json`. Evidence: `foxcode/.claude-plugin/plugin.json`
  - [x] Plugin `.mcp.json` declares foxcode MCP server (`node ${CLAUDE_PLUGIN_ROOT}/channel/server.mjs`), auto-loads on plugin enable. Evidence: `foxcode/.mcp.json`
  - [x] `claude plugin validate .` passes. Evidence: validated locally, `claude plugin validate .` -> "Validation passed"
  - [x] Launch skills are self-contained: check prerequisites, locate extension, cache in `.foxcode/config.json`, launch/guide, verify. Evidence: `foxcode/skills/foxcode-run-project-profile/SKILL.md`, `foxcode/skills/foxcode-run-user-profile/SKILL.md`
  - [x] Skills check prerequisites: Node.js ≥18 (project profile), Firefox installed. Clear error with fix instructions per platform. Evidence: `foxcode/skills/foxcode-run-project-profile/SKILL.md` Step 3
  - [x] Two launch modes: **Project Profile** (isolated Firefox via web-ext) and **User Profile** (manual about:debugging). Evidence: `foxcode/skills/foxcode-run-project-profile/SKILL.md`, `foxcode/skills/foxcode-run-user-profile/SKILL.md`
  - [x] Skills communicate in user's language (auto-detect from conversation context). Evidence: SKILL.md frontmatter
  - [x] On error: stops, explains what went wrong, suggests fix, does NOT silently skip steps. Evidence: SKILL.md Step 3

### 4.2 NF-2: Easy Launch [very important]
- [x] Zero extra processes: CC loads channel from .mcp.json automatically. Evidence: `.mcp.json`, tested
- [x] `status` tool returns server telemetry (port, clients, uptime, launchMode, client) without browser. Evidence: `foxcode/channel/server.mjs` (status handler)
- [x] `/foxcode:foxcode-run-project-profile` flow: status -> web-ext launch -> verify via status. Evidence: `foxcode/skills/foxcode-run-project-profile/SKILL.md`
- [x] `/foxcode:foxcode-run-user-profile` flow: status -> guide manual loading -> auto-open connection page -> poll & verify via status. Evidence: `foxcode/skills/foxcode-run-user-profile/SKILL.md`
- [x] Extension connects via URL hash (`#PORT:PASSWORD`) or saved sessions. No port scanning, no manual settings form. Evidence: `extension/background/background.js` (connect flow), `extension/background/url-params.js`

### 4.3 NF-3: Reliability [very important]
- [x] Per-session auto-reconnect with exponential backoff (3s → 30s max, 10 attempts). Evidence: `extension/background/background.js:172-189` (scheduleReconnect)
- [x] Graceful degradation when no sessions: "No active sessions" banner in popup. Evidence: `extension/popup/popup.js:43-52`, `extension/popup/popup.html:9-12`
- [x] Background sends session-update to popup. Evidence: `extension/background/background.js:191-203` (notifyPopupSessions)
- [x] Background pings all connected servers on popup connect. Evidence: `extension/background/background.js:335-339`
- [ ] No message loss during normal operation - not verified
- [x] No interference with CC terminal workflow. Evidence: tested manually

### 4.4 NF-4: Simplicity [important]
- [x] Minimal moving parts: 1 MCP server + 1 extension, standard WebSocket protocol

### 4.5 NF-5: Security
- [x] All traffic local. Evidence: `foxcode/channel/lib.mjs` (createHttpServer binds 127.0.0.1)
- [x] WebSocket upgrade-level password auth: server generates random password (persisted `~/.foxcode/password`, mode 0600), rejects connections without valid `?token=` param (HTTP 401). Evidence: `foxcode/channel/server.mjs` (upgrade handler), `foxcode/channel/lib.mjs` (passwordStorage)
- [x] Session params (port+password array) saved in `browser.storage.local` for reconnection. Evidence: `extension/background/background.js:43-49` (saveSessions)

### 4.6 NF-6: Performance
- [x] Message delivery latency <1s. Evidence: tested manually

## 5. Interfaces
- **Transport:** Channel Plugin (MCP server inside CC) ↔ WebSocket localhost:8787 ↔ Firefox Extension
- **Extension APIs:** browser.browserAction, browser.runtime, browser.tabs, browser.cookies, browser.webNavigation, browser.windows
- **UI:** Popup eval debug console (browser_action, on-demand)

## 6. Acceptance
- **Criteria:**
  - [x] Extension loads in Firefox without errors
  - [x] Eval requests/responses visible in popup on demand
  - Removed: Messages sent from sidebar (FR-2 removed)
  - [x] Page content/selection delivered to CC session
  - [x] CC can pull browser context from terminal
  - [x] Works with project-specific CC sessions
  - [x] Launch = run `claude --dangerously-load-development-channels plugin:foxcode@korchasa` from project dir with .mcp.json
