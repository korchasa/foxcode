# SRS

## 1. Intro
- **Desc:** FoxCode — Firefox WebExtension providing browser UI for active Claude Code sessions. Real-time message sync, bidirectional communication, and page context injection into running CLI sessions.
- **Def/Abbr:**
  - CC: Claude Code (CLI tool)
  - Channel: MCP server pushing events into a CC session

## 2. General
- **Context:** Developer runs Claude Code in terminal. Wants to see session messages in browser, send messages from browser, and inject page content as context — without leaving the browser or restarting CC.
- **Assumptions/Constraints:**
  - Firefox 78.0+ required
  - Claude Code CLI v2.1.80+ installed and running
  - All communication local (localhost), no external servers
  - Cross-platform (macOS primary, Linux/Windows secondary)

## 3. Functional Reqs

### 3.1 FR-1: Real-Time Session Sync
- **Desc:** Display messages from active CC session in browser sidebar as they appear
- **Scenario:** User has CC running in terminal → opens sidebar → sees live message stream (user prompts, assistant responses, tool calls/results)
- **Acceptance:**
  - [x] New messages from CC session appear in sidebar within 1s. Evidence: `foxcode/channel/server.mjs:98-119` (reply tool broadcasts via WebSocket), `extension/sidebar/sidebar.js:57-70` (addMessage renders)
  - [x] All message types rendered: user, assistant (text), tool use, tool result. Evidence: `extension/sidebar/sidebar.js:117-147` (addMessage: user/assistant), `extension/sidebar/sidebar.js:86-114` (addToolUseMessage, addToolResultMessage), `foxcode/channel/server.mjs:105-126` (broadcasts tool_use/tool_result)
  - [x] Connection status indicator (connected/disconnected). Evidence: `extension/sidebar/sidebar.js:43-46` (setStatus), `extension/sidebar/sidebar.css:17-19` (.connected/.disconnected)

### 3.2 FR-2: Send Messages
- **Desc:** Send text messages from browser into active CC session
- **Scenario:** User types message in sidebar input → message delivered to CC session → CC processes it → response visible in both terminal and sidebar
- **Acceptance:**
  - [x] Text input in sidebar sends message to CC session. Evidence: `extension/sidebar/sidebar.js:74-86` (form submit), `extension/background/background.js:116-119` (forwards to channel)
  - [x] Sent message appears in terminal. Evidence: `foxcode/channel/server.mjs:80-89` (mcp.notification with notifications/claude/channel)
  - [x] Response visible in sidebar via FR-1. Evidence: tested manually

### 3.3 FR-3: Page Context Injection
- **Desc:** Send current page content or selected text as context into CC session
- **Scenario:** CC requests page content via MCP tool → content delivered as context to active CC session
- **Acceptance:**
  - [x] Page content accessible to CC via `get_page_content` MCP tool. Evidence: `foxcode/channel/server.mjs:105-110` (get_page_content tool), `extension/content/content-script.js:27-73` (extractPageContent)
  - [x] Content arrives in CC session as user message with clear source attribution. Evidence: `foxcode/channel/server.mjs:91-100` (page_content with [Page: url] prefix)

### 3.4 FR-4: Project Context
- **Desc:** Work from browser in context of a specific project directory
- **Scenario:** User selects project (cwd) → CC session operates in that project's directory → has access to project files, CLAUDE.md, git context
- **Acceptance:**
  - [x] User can specify/select project directory. Evidence: inherent — user runs `claude` from project dir
  - [x] CC session runs in chosen project context. Evidence: inherent — CC + channel plugin operate in cwd

### 3.5 FR-5: Browser Automation via evalInBrowser
- **Desc:** CC executes JS in browser via single `evalInBrowser` MCP tool. Agent writes code using `api` object with ~30 async helpers for DOM, navigation, tabs, cookies, screenshots, storage. Replaces get_page_content/get_selected_text/get_page_url.
- **Scenario:** CC calls `evalInBrowser({code: "await navigate('...'); await fill('#email','x'); return await snapshot()"})` → code runs in background script → DOM ops delegated to tab via executeScript → result returned to CC
- **Acceptance:**
  - [x] `evalInBrowser` MCP tool with `code` (string) + `timeout` (number, optional) params. Evidence: `foxcode/channel/lib.mjs:78-120` (TOOL_DEFINITIONS), `foxcode/channel/server.mjs:148-157` (handler)
  - [x] Code syntax validated before execution (async-aware). Evidence: `foxcode/channel/validator.mjs:7-12` (validateCode), `foxcode/channel/validator.test.mjs`
  - [x] Background script executes code via `new Function('api', ...)` with injected API object. Evidence: `extension/background/background.js:139-148`
  - [x] API provides DOM helpers (click, fill, type, select, check, hover, waitFor, $, $$, snapshot). Evidence: `extension/background/browser-api.js:87-192`, `extension/background/dom-helpers.js`
  - [x] DOM helpers auto-wait for element (poll 100ms, configurable timeout). Evidence: `extension/background/dom-helpers.js:19-43` (buildWaitAndAct)
  - [x] Navigation helpers await page load via webNavigation.onCompleted. Evidence: `extension/background/browser-api.js:249-259`
  - [x] `navigate()` creates new active tab on first call. Subsequent navigations reuse and activate managed tab. `closeTab()` resets state. Evidence: `extension/background/browser-api.js:18-28,248-259,297-307`, `extension/background/browser-api.test.js:364-548`
  - [x] Privileged helpers (screenshot, cookies, tabs, resize) call WebExtension APIs directly. Evidence: `extension/background/browser-api.js:290-313`
  - [x] `api.eval(expr)` executes in page main world via wrappedJSObject. Evidence: `extension/content/content-script.js:8-14`, `extension/background/browser-api.js:230-240`
  - [x] Timeout (default 30s) via Promise.race. Evidence: `extension/background/background.js:142-145`
  - [x] `reply` + `edit_message` tools preserved. Evidence: `foxcode/channel/lib.mjs:77-100`
  - [x] Old tools removed (get_page_content, get_selected_text, get_page_url). Evidence: `foxcode/channel/lib.mjs` (4 tools: ping, reply, edit_message, evalInBrowser)
  - [x] Manifest updated: cookies, webNavigation, `<all_urls>` permissions + CSP unsafe-eval. Evidence: `extension/manifest.json:6-11,13`
  - [x] Unit tests for validator, dom-helpers, browser-api. Evidence: `foxcode/channel/validator.test.mjs`, `extension/background/dom-helpers.test.js`, `extension/background/browser-api.test.js`
  - [ ] Integration test: background executes code → delegates to tab → returns result (requires Firefox)
  - [x] MCP instructions describe API reference. Evidence: `foxcode/channel/lib.mjs:82-118` (evalInBrowser description)

## 4. Non-Functional

### 4.1 NF-1: Easy Install via Claude Code Plugin [critical]
- **Desc:** Primary install/update path = CC Plugin Marketplace. Plugin auto-configures MCP server; install command (`/foxcode:foxcode-install`) guides user through Firefox extension setup. User should NOT need to read docs or edit configs manually.
- **Scenario:** User runs `/plugin marketplace add korchasa/foxcode` → `/plugin install foxcode@korchasa` → `/foxcode:foxcode-install` → command checks prereqs, downloads .xpi, guides Firefox setup → user launches CC with `--dangerously-load-development-channels server:foxcode` → done.
- **Acceptance:**
  - [x] Legacy `install-prompt.md` removed — plugin is the only install path. Evidence: file deleted
  - [x] Plugin marketplace structure: `.claude-plugin/marketplace.json` at repo root. Evidence: `.claude-plugin/marketplace.json`
  - [x] Plugin manifest: `plugins/foxcode/.claude-plugin/plugin.json`. Evidence: `plugins/foxcode/.claude-plugin/plugin.json`
  - [x] Plugin `.mcp.json` declares foxcode MCP server (`node ${CLAUDE_PLUGIN_ROOT}/channel/server.mjs`), auto-loads on plugin enable. Evidence: `foxcode/.mcp.json`
  - [x] Install command: `plugins/foxcode/commands/foxcode-install.md`. Evidence: `plugins/foxcode/commands/foxcode-install.md`
  - [x] `claude plugin validate .` passes. Evidence: validated locally, `claude plugin validate .` → "Validation passed"
  - [x] Command checks prerequisites: Node.js ≥18, Firefox installed. Reports clear error with fix instructions per platform (macOS/Linux). Evidence: `plugins/foxcode/commands/foxcode-install.md` Step 1
  - [x] Command downloads `foxcode-extension.xpi` from GitHub releases, verifies integrity (size >0). Evidence: `plugins/foxcode/commands/foxcode-install.md` Step 2
  - [x] Command asks user: **A) Separate window** (`web-ext run`, requires cloned repo) or **B) Existing Firefox** (`about:debugging` manual load with .xpi). Evidence: `plugins/foxcode/commands/foxcode-install.md` Step 3
  - [x] Option A (only path): resolves extension source (local or marketplace clone), launches Firefox with persistent project-local profile via `web-ext run`. Evidence: `foxcode/commands/foxcode-install.md` Steps 2-3
  - [x] ~~Option B removed~~ — single install path via separate Firefox profile
  - [x] Command provides final summary: MCP via plugin, launch command (`--dangerously-load-development-channels`), sidebar access, tool permissions note. Evidence: `plugins/foxcode/commands/foxcode-install.md` Step 5
  - [x] Command is idempotent — detects existing .xpi, asks re-download or skip. Evidence: `plugins/foxcode/commands/foxcode-install.md` Step 2
  - [x] Command communicates in user's language (auto-detect from conversation context). Evidence: `plugins/foxcode/commands/foxcode-install.md` Step 0
  - [x] Command explains each step BEFORE executing it (transparency). Evidence: `plugins/foxcode/commands/foxcode-install.md` Step 0
  - [x] On error: stops, explains what went wrong, suggests fix, does NOT silently skip steps. Evidence: `plugins/foxcode/commands/foxcode-install.md` Steps 1-2

### 4.2 NF-2: Easy Launch [very important]
- [x] Zero extra processes: CC loads channel from .mcp.json automatically. Evidence: `.mcp.json`, tested
- [x] Requires `--dangerously-load-development-channels server:foxcode` flag (channels in research preview). Evidence: `foxcode/commands/foxcode-run.md`
- [x] `ping` tool verifies bidirectional connectivity (CC → browser → CC). Evidence: `foxcode/channel/lib.mjs` (TOOL_DEFINITIONS ping), `foxcode/channel/server.mjs` (ping handler), `extension/background/background.js` (auto-reply pong)
- [x] `/foxcode:foxcode-ping` command wraps ping tool with user-facing diagnostics. Evidence: `foxcode/commands/foxcode-ping.md`
- [x] `/foxcode:foxcode-run` Step 3 calls ping after Firefox launch. Evidence: `foxcode/commands/foxcode-run.md`

### 4.3 NF-3: Reliability [very important]
- [x] Auto-reconnect on connection loss. Evidence: `extension/background/background.js:46-54` (scheduleReconnect with backoff)
- [x] Graceful degradation when CC not running. Evidence: `extension/sidebar/sidebar.js:43-46` (status indicator)
- [ ] No message loss during normal operation — not verified
- [x] No interference with CC terminal workflow. Evidence: tested manually

### 4.4 NF-4: Simplicity [important]
- [x] Minimal moving parts: 1 MCP server + 1 extension, standard WebSocket protocol

### 4.5 NF-5: Security
- [x] All traffic local. Evidence: `foxcode/channel/server.mjs:28` (WebSocketServer host: '127.0.0.1')
- [x] No credentials stored in extension

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
  - [x] Launch = run `claude --dangerously-load-development-channels server:foxcode` from project dir with .mcp.json
