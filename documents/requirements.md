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
  - [x] New messages from CC session appear in sidebar within 1s. Evidence: `channel/server.mjs:98-119` (reply tool broadcasts via WebSocket), `extension/sidebar/sidebar.js:57-70` (addMessage renders)
  - [x] All message types rendered: user, assistant (text), tool use, tool result. Evidence: `extension/sidebar/sidebar.js:117-147` (addMessage: user/assistant), `extension/sidebar/sidebar.js:86-114` (addToolUseMessage, addToolResultMessage), `channel/server.mjs:105-126` (broadcasts tool_use/tool_result)
  - [x] Connection status indicator (connected/disconnected). Evidence: `extension/sidebar/sidebar.js:43-46` (setStatus), `extension/sidebar/sidebar.css:17-19` (.connected/.disconnected)

### 3.2 FR-2: Send Messages
- **Desc:** Send text messages from browser into active CC session
- **Scenario:** User types message in sidebar input → message delivered to CC session → CC processes it → response visible in both terminal and sidebar
- **Acceptance:**
  - [x] Text input in sidebar sends message to CC session. Evidence: `extension/sidebar/sidebar.js:74-86` (form submit), `extension/background/background.js:116-119` (forwards to channel)
  - [x] Sent message appears in terminal. Evidence: `channel/server.mjs:80-89` (mcp.notification with notifications/claude/channel)
  - [x] Response visible in sidebar via FR-1. Evidence: tested manually

### 3.3 FR-3: Page Context Injection
- **Desc:** Send current page content or selected text as context into CC session
- **Scenario:** User clicks "Send page" or selects text → right-click → "Send to Claude" → content delivered as message/context to active CC session
- **Acceptance:**
  - [x] Page content accessible to CC via `get_page_content` MCP tool. Evidence: `channel/server.mjs:105-110` (get_page_content tool), `extension/content/content-script.js:27-73` (extractPageContent)
  - [x] Context menu on selected text sends selection to CC session. Evidence: `extension/background/background.js:131-147` (contextMenus handler)
  - [x] Content arrives in CC session as user message with clear source attribution. Evidence: `channel/server.mjs:91-100` (page_content with [Page: url] prefix)

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
  - [x] `evalInBrowser` MCP tool with `code` (string) + `timeout` (number, optional) params. Evidence: `channel/lib.mjs:78-120` (TOOL_DEFINITIONS), `channel/server.mjs:148-157` (handler)
  - [x] Code syntax validated before execution (async-aware). Evidence: `channel/validator.mjs:7-12` (validateCode), `channel/validator.test.mjs`
  - [x] Background script executes code via `new Function('api', ...)` with injected API object. Evidence: `extension/background/background.js:139-148`
  - [x] API provides DOM helpers (click, fill, type, select, check, hover, waitFor, $, $$, snapshot). Evidence: `extension/background/browser-api.js:87-192`, `extension/background/dom-helpers.js`
  - [x] DOM helpers auto-wait for element (poll 100ms, configurable timeout). Evidence: `extension/background/dom-helpers.js:19-43` (buildWaitAndAct)
  - [x] Navigation helpers await page load via webNavigation.onCompleted. Evidence: `extension/background/browser-api.js:249-259`
  - [x] `navigate()` creates new background tab on first call, preserving user's active tab. Subsequent operations target managed tab. `closeTab()` resets state. Evidence: `extension/background/browser-api.js:18-28,249-259,297-307`, `extension/background/browser-api.test.js:364-548`
  - [x] Privileged helpers (screenshot, cookies, tabs, resize) call WebExtension APIs directly. Evidence: `extension/background/browser-api.js:290-313`
  - [x] `api.eval(expr)` executes in page main world via wrappedJSObject. Evidence: `extension/content/content-script.js:8-14`, `extension/background/browser-api.js:230-240`
  - [x] Timeout (default 30s) via Promise.race. Evidence: `extension/background/background.js:142-145`
  - [x] `reply` + `edit_message` tools preserved. Evidence: `channel/lib.mjs:77-100`
  - [x] Old tools removed (get_page_content, get_selected_text, get_page_url). Evidence: `channel/lib.mjs` (only 3 tools)
  - [x] Manifest updated: cookies, webNavigation, `<all_urls>` permissions + CSP unsafe-eval. Evidence: `extension/manifest.json:6-11,13`
  - [x] Unit tests for validator, dom-helpers, browser-api. Evidence: `channel/validator.test.mjs`, `extension/background/dom-helpers.test.js`, `extension/background/browser-api.test.js`
  - [ ] Integration test: background executes code → delegates to tab → returns result (requires Firefox)
  - [x] MCP instructions describe API reference. Evidence: `channel/lib.mjs:82-118` (evalInBrowser description)

## 4. Non-Functional

### 4.1 NF-1: Easy Install [important]
- [x] Load as temporary add-on via about:debugging + .mcp.json in project
- [ ] One-step extension install (Firefox Add-ons or local .xpi) — deferred
- [ ] No manual config file editing — permissions added to settings.json

### 4.7 NF-7: Automated Setup via Claude Code Prompt [very important]
- **Desc:** User pastes a setup prompt into Claude Code session. CC automates all possible steps; outputs manual instructions for what requires human action (browser GUI).
- **Scenario:** User has CC running in any project dir → pastes install prompt → CC clones repo / checks local copy, installs deps, configures .mcp.json, sets permissions → tells user to load extension in Firefox manually → user loads extension → done.
- **Acceptance:**
  - [ ] Setup prompt file exists at `install-prompt.md` in repo root
  - [ ] Prompt checks prerequisites: Node.js ≥18, Firefox installed, CC CLI ≥2.1.80
  - [ ] Prompt runs `npm install` in `channel/`
  - [ ] Prompt creates/updates `.mcp.json` in target project with correct path to `channel/server.mjs`
  - [ ] Prompt adds MCP server permissions to CC settings (`~/.claude/settings.json` or project `.claude/settings.local.json`)
  - [ ] Prompt outputs clear manual steps for Firefox extension loading (about:debugging → Load Temporary Add-on → path to `extension/manifest.json`)
  - [ ] Prompt verifies setup by checking channel server starts without errors (`node channel/server.mjs` smoke test)
  - [ ] Prompt is idempotent — safe to run multiple times

### 4.2 NF-2: Easy Launch [very important]
- [x] Zero extra processes: CC loads channel from .mcp.json automatically. Evidence: `.mcp.json`, tested
- [x] No special CLI flags needed. Evidence: .mcp.json auto-loading, tested

### 4.3 NF-3: Reliability [very important]
- [x] Auto-reconnect on connection loss. Evidence: `extension/background/background.js:46-54` (scheduleReconnect with backoff)
- [x] Graceful degradation when CC not running. Evidence: `extension/sidebar/sidebar.js:43-46` (status indicator)
- [ ] No message loss during normal operation — not verified
- [x] No interference with CC terminal workflow. Evidence: tested manually

### 4.4 NF-4: Simplicity [important]
- [x] Minimal moving parts: 1 MCP server + 1 extension, standard WebSocket protocol

### 4.5 NF-5: Security
- [x] All traffic local. Evidence: `channel/server.mjs:28` (WebSocketServer host: '127.0.0.1')
- [x] No credentials stored in extension

### 4.6 NF-6: Performance
- [x] Message delivery latency <1s. Evidence: tested manually

## 5. Interfaces
- **Transport:** Channel Plugin (MCP server inside CC) ↔ WebSocket localhost:8787 ↔ Firefox Extension
- **Extension APIs:** browser.sidebarAction, browser.contextMenus, browser.runtime, browser.tabs, browser.cookies, browser.webNavigation, browser.windows
- **UI:** Sidebar panel with message stream and input

## 6. Acceptance
- **Criteria:**
  - [x] Extension loads in Firefox without errors
  - [x] Messages from CC terminal visible in sidebar in real-time
  - [x] Messages sent from sidebar visible in CC terminal
  - [x] Page content/selection delivered to CC session
  - [x] CC can pull browser context from terminal
  - [x] Works with project-specific CC sessions
  - [x] Launch = just run `claude` from project dir with .mcp.json
