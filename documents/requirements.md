# SRS

## 1. Intro
- **Desc:** FoxCode - Firefox WebExtension providing browser UI for active Claude Code sessions. Real-time message sync, bidirectional communication, and page context injection into running CLI sessions.
- **Def/Abbr:**
  - CC: Claude Code (CLI tool)
  - Channel: MCP server pushing events into a CC session

## 2. General
- **Context:** Developer runs Claude Code in terminal. Wants to see session messages in browser, send messages from browser, and inject page content as context - without leaving the browser or restarting CC.
- **Assumptions/Constraints:**
  - Firefox 78.0+ required
  - Claude Code CLI v2.1.80+ installed and running
  - All communication local (localhost), no external servers
  - Cross-platform (macOS primary, Linux/Windows secondary)

## 3. Functional Reqs

### 3.1 FR-1: Real-Time Session Sync
- **Desc:** Display messages from active CC session in browser sidebar as they appear
- **Scenario:** User has CC running in terminal -> opens sidebar -> sees live message stream (user prompts, assistant responses, tool calls/results)
- **Acceptance:**
  - [x] New messages from CC session appear in sidebar within 1s. Evidence: `foxcode/channel/server.mjs:245-248` (reply tool broadcasts via WebSocket), `extension/sidebar/sidebar.js:166` (addMessage renders)
  - [x] All message types rendered: user, assistant (text), tool use, tool result. Evidence: `extension/sidebar/sidebar.js:166` (addMessage: user/assistant), `extension/sidebar/sidebar.js:224-253` (addToolUseMessage, addToolResultMessage), `foxcode/channel/server.mjs:256,259` (broadcasts tool_use/tool_result)
  - [x] Connection status indicator (connected/disconnected). Evidence: `extension/sidebar/sidebar.js:82-98` (setStatus), `extension/sidebar/sidebar.css:35-36,123` (CSS vars + .connected)

### 3.2 FR-2: Send Messages
- **Desc:** Send text messages from browser into active CC session
- **Scenario:** User types message in sidebar input -> message delivered to CC session -> CC processes it -> response visible in both terminal and sidebar
- **Acceptance:**
  - [x] Text input in sidebar sends message to CC session. Evidence: `extension/sidebar/sidebar.js:275-289` (form submit), `extension/background/background.js:159` (forwards to channel)
  - [x] Sent message appears in terminal. Evidence: `foxcode/channel/server.mjs:159-164` (mcp.notification with notifications/claude/channel)
  - [x] Response visible in sidebar via FR-1. Evidence: tested manually

### 3.3 FR-3: Page Context Injection [SUPERSEDED by FR-5]
- **Desc:** Send current page content or selected text as context into CC session
- **Scenario:** CC requests page content via MCP tool -> content delivered as context to active CC session
- **Acceptance:**
  - [x] Page content accessible to CC via `api.snapshot()` and `api.eval()` in `evalInBrowser`. Evidence: `extension/background/browser-api.js:116-198` (DOM helpers), `extension/content/content-script.js:7-21` (eval in page world)
  - [x] Content arrives in CC session as tool result. Evidence: `foxcode/channel/server.mjs:250-261` (evalInBrowser handler)

### 3.4 FR-4: Project Context
- **Desc:** Work from browser in context of a specific project directory
- **Scenario:** User selects project (cwd) -> CC session operates in that project's directory -> has access to project files, CLAUDE.md, git context
- **Acceptance:**
  - [x] User can specify/select project directory. Evidence: inherent - user runs `claude` from project dir
  - [x] CC session runs in chosen project context. Evidence: inherent - CC + channel plugin operate in cwd

### 3.5 FR-5: Browser Automation via evalInBrowser
- **Desc:** CC executes JS in browser via single `evalInBrowser` MCP tool. Agent writes code using `api` object with ~30 async helpers for DOM, navigation, tabs, cookies, screenshots, storage. Replaces get_page_content/get_selected_text/get_page_url.
- **Scenario:** CC calls `evalInBrowser({code: "await navigate('...'); await fill('#email','x'); return await snapshot()"})` -> code runs in background script -> DOM ops delegated to tab via executeScript -> result returned to CC
- **Acceptance:**
  - [x] `evalInBrowser` MCP tool with `code` (string) + `timeout` (number, optional) params. Evidence: `foxcode/channel/lib.mjs:207-293` (TOOL_DEFINITIONS), `foxcode/channel/server.mjs:250-261` (handler)
  - [x] Code syntax validated before execution (async-aware). Evidence: `foxcode/channel/validator.mjs:5-12` (validateCode), `foxcode/channel/validator.test.mjs`
  - [x] Background script executes code via `new Function('api', ...)` with injected API object. Evidence: `extension/background/background.js:206-216`
  - [x] API provides DOM helpers (click, fill, type, select, check, hover, waitFor, $, $$, snapshot). Evidence: `extension/background/browser-api.js:87-192`, `extension/background/dom-helpers.js`
  - [x] DOM helpers auto-wait for element (poll 100ms, configurable timeout). Evidence: `extension/background/dom-helpers.js:19-43` (buildWaitAndAct)
  - [x] Navigation helpers await page load via webNavigation.onCompleted. Evidence: `extension/background/browser-api.js:249-259`
  - [x] `navigate()` creates new active tab on first call. Subsequent navigations reuse and activate managed tab. `closeTab()` resets state. Evidence: `extension/background/browser-api.js:18-28,248-259,297-307`, `extension/background/browser-api.test.js:364-548`
  - [x] Privileged helpers (screenshot, cookies, tabs, resize) call WebExtension APIs directly. Evidence: `extension/background/browser-api.js:290-313`
  - [x] `api.eval(expr)` executes in page main world via wrappedJSObject. Evidence: `extension/content/content-script.js:8-14`, `extension/background/browser-api.js:230-240`
  - [x] Timeout (default 30s) via Promise.race. Evidence: `extension/background/background.js:210-214`
  - [x] `reply` tool preserved. Evidence: `foxcode/channel/lib.mjs:41-44`
  - [x] Old tools removed (get_page_content, get_selected_text, get_page_url, edit_message). Evidence: `foxcode/channel/lib.mjs` (4 tools: status, ping, reply, evalInBrowser)
  - [x] Manifest updated: cookies, webNavigation, `<all_urls>` permissions + CSP unsafe-eval. Evidence: `extension/manifest.json:6-11,13`
  - [x] Unit tests for validator, dom-helpers, browser-api. Evidence: `foxcode/channel/validator.test.mjs`, `extension/background/dom-helpers.test.js`, `extension/background/browser-api.test.js`
  - [ ] Integration test: background executes code -> delegates to tab -> returns result (requires Firefox)
  - [x] MCP instructions describe API reference. Evidence: `foxcode/channel/lib.mjs:237-277` (evalInBrowser description)

## 4. Non-Functional

### 4.1 NF-1: Easy Install via Claude Code Plugin [critical]
- **Desc:** Primary install/update path = CC Plugin Marketplace. Plugin auto-configures MCP server; self-contained launch skills handle prerequisites and Firefox setup. User should NOT need to read docs or edit configs manually.
- **Scenario:** User runs `/plugin marketplace add korchasa/foxcode` -> `/plugin install foxcode@korchasa` -> `/foxcode:foxcode-run-project-profile` or `/foxcode:foxcode-run-user-profile` -> skill checks prereqs, locates extension, launches/guides Firefox setup, caches paths in `.foxcode/config.json` -> user launches CC with `--dangerously-load-development-channels plugin:foxcode@korchasa` -> done.
- **Acceptance:**
  - [x] Legacy `install-prompt.md` removed - plugin is the only install path. Evidence: file deleted
  - [x] Plugin marketplace structure: `.claude-plugin/marketplace.json` at repo root. Evidence: `.claude-plugin/marketplace.json`
  - [x] Plugin manifest: `plugins/foxcode/.claude-plugin/plugin.json`. Evidence: `plugins/foxcode/.claude-plugin/plugin.json`
  - [x] Plugin `.mcp.json` declares foxcode MCP server (`node ${CLAUDE_PLUGIN_ROOT}/channel/server.mjs`), auto-loads on plugin enable. Evidence: `foxcode/.mcp.json`
  - [x] `claude plugin validate .` passes. Evidence: validated locally, `claude plugin validate .` -> "Validation passed"
  - [x] Launch skills are self-contained: check prerequisites, locate extension, cache in `.foxcode/config.json`, launch/guide, verify. Evidence: `foxcode/skills/foxcode-run-project-profile/SKILL.md`, `foxcode/skills/foxcode-run-user-profile/SKILL.md`
  - [x] Skills check prerequisites: Node.js ≥18 (project profile), Firefox installed. Clear error with fix instructions per platform. Evidence: `foxcode/skills/foxcode-run-project-profile/SKILL.md` Step 3
  - [x] Two launch modes: **Project Profile** (isolated Firefox via web-ext) and **User Profile** (manual about:debugging). Evidence: `foxcode/skills/foxcode-run-project-profile/SKILL.md`, `foxcode/skills/foxcode-run-user-profile/SKILL.md`
  - [x] Skills communicate in user's language (auto-detect from conversation context). Evidence: SKILL.md frontmatter
  - [x] On error: stops, explains what went wrong, suggests fix, does NOT silently skip steps. Evidence: SKILL.md Step 3

### 4.2 NF-2: Easy Launch [very important]
- [x] Zero extra processes: CC loads channel from .mcp.json automatically. Evidence: `.mcp.json`, tested
- [x] Requires `--dangerously-load-development-channels plugin:foxcode@korchasa` flag (channels in research preview). Evidence: `foxcode/skills/foxcode-run-project-profile/SKILL.md`
- [x] `status` tool returns server telemetry (port, clients, uptime, launchMode, channelsDetected, client) without browser. Evidence: `foxcode/channel/server.mjs:210-229` (status handler)
- [x] `ping` tool verifies bidirectional connectivity (CC -> browser -> CC). Evidence: `foxcode/channel/lib.mjs` (TOOL_DEFINITIONS ping), `foxcode/channel/server.mjs` (ping handler), `extension/background/background.js` (auto-reply pong)
- [x] `/foxcode:foxcode-run-project-profile` flow: status (incl. channelsDetected check) -> ping -> web-ext launch -> verify. Evidence: `foxcode/skills/foxcode-run-project-profile/SKILL.md`
- [x] `/foxcode:foxcode-run-user-profile` flow: status (incl. channelsDetected check) -> ping -> guide manual loading -> verify. Evidence: `foxcode/skills/foxcode-run-user-profile/SKILL.md`
- [x] Extension connects via URL hash params (`foxcode-port` + `foxcode-password`) or saved params or manual sidebar settings form. No port scanning. Evidence: `extension/background/background.js` (connect flow), `extension/background/url-params.js`
- [x] Channel detection: MCP server detects `--dangerously-load-development-channels` in CC process args via process tree walk at startup (ps on macOS/Linux, PowerShell on Windows). Result in `status` tool and `pong` message. Evidence: `foxcode/channel/lib.mjs:200-234` (detectChannels), `foxcode/channel/server.mjs:32` (CHANNELS_DETECTED)
- [x] Skills warn when channels not detected: sidebar messages won't reach CC, but CC→Browser tools work. Evidence: `foxcode/skills/foxcode-run-project-profile/SKILL.md` Step 1, `foxcode/skills/foxcode-run-user-profile/SKILL.md` Step 1

### 4.3 NF-3: Reliability [very important]
- [x] Auto-reconnect on connection loss with exponential backoff (3s → 30s max). Evidence: `extension/background/background.js:140-152` (scheduleReconnect)
- [x] Graceful degradation when CC not running: diagnostic panel shows port, params source, error, retry timer. Evidence: `extension/sidebar/sidebar.js:97-133` (setStatus, updateInputState, updateDiag)
- [x] Channels warning: sidebar shows banner + disables input when channelsDetected=false. Evidence: `extension/sidebar/sidebar.js:289-300` (updateActiveServerInfo), `extension/sidebar/sidebar.html:23-26`
- [x] Input state managed with priority: disconnected > no channels > normal. Single source of truth via `updateInputState()`. Evidence: `extension/sidebar/sidebar.js:98-112`
- [x] Background sends enriched status (port, source, error, reconnectIn) to sidebar. Evidence: `extension/background/background.js:179-188` (broadcastStatus)
- [x] Background pings server on sidebar connect to get fresh pong with server details. Evidence: `extension/background/background.js:255-260`
- [ ] No message loss during normal operation - not verified
- [x] No interference with CC terminal workflow. Evidence: tested manually

### 4.4 NF-4: Simplicity [important]
- [x] Minimal moving parts: 1 MCP server + 1 extension, standard WebSocket protocol

### 4.5 NF-5: Security
- [x] All traffic local. Evidence: `foxcode/channel/lib.mjs` (createHttpServer binds 127.0.0.1)
- [x] WebSocket upgrade-level password auth: server generates random password (persisted `~/.foxcode/password`, mode 0600), rejects connections without valid `?token=` param (HTTP 401). Evidence: `foxcode/channel/server.mjs` (upgrade handler), `foxcode/channel/lib.mjs` (passwordStorage)
- [x] Connection params (port+password) saved in `browser.storage.local` for reconnection. Evidence: `extension/background/background.js` (saveConnectionParams)

### 4.6 NF-6: Performance
- [x] Message delivery latency <1s. Evidence: tested manually

## 5. Interfaces
- **Transport:** Channel Plugin (MCP server inside CC) ↔ WebSocket localhost:8787 ↔ Firefox Extension
- **Extension APIs:** browser.sidebarAction, browser.runtime, browser.tabs, browser.cookies, browser.webNavigation, browser.windows
- **UI:** Sidebar panel with message stream and input

## 6. Acceptance
- **Criteria:**
  - [x] Extension loads in Firefox without errors
  - [x] Messages from CC terminal visible in sidebar in real-time
  - [x] Messages sent from sidebar visible in CC terminal
  - [x] Page content/selection delivered to CC session
  - [x] CC can pull browser context from terminal
  - [x] Works with project-specific CC sessions
  - [x] Launch = run `claude --dangerously-load-development-channels plugin:foxcode@korchasa` from project dir with .mcp.json
