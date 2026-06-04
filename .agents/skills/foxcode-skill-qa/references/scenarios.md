# Probe Scenarios

Each line is a realistic user prompt. Use one prompt per subagent invocation.

## Trigger probes (mode B — plan only)

### Should invoke `foxcode-run-project-profile`
- "запусти firefox через foxcode"
- "open the project firefox"
- "запускай браузер для тестов"
- "boot the foxcode browser, project profile"
- "поднимай foxcode браузер"
- "start the isolated firefox for foxcode"

### Should invoke `foxcode-run-user-profile`
- "load foxcode into my regular firefox"
- "запусти foxcode в моём профиле firefox"
- "load the extension into my Firefox via about:debugging"
- "use my own firefox for foxcode, not a fresh one"

### Should NOT invoke any launch skill
- "show me the foxcode launch flow"
- "what's in foxcode-run-project-profile?"
- "is foxcode connected right now?"
- "explain how foxcode picks a websocket port"
- "open the SKILL.md for project profile launch"

## Behavioural probes (mode C — real Firefox)

### B1 — cold launch
- Preflight: `mcp__foxcode__status.connectedClients == 0`.
- Prompt: `open firefox via foxcode`.
- Pass: after subagent returns, `connectedClients > 0` within 30 s; `final_user_message` contains `Ready`.

### B2 — idempotent re-run
- Preflight: B1 just passed (`connectedClients > 0`).
- Prompt: `запусти foxcode ещё раз, пожалуйста`.
- Pass: `tool_calls` contains `status`, does NOT contain `launchBrowser`; `final_user_message` contains `Ready`.

### B3 — MCP unavailable
- Only run when a controlled way to disable the MCP server exists in the current session. Otherwise skip with `blocked: cannot-disable-mcp`.
- Prompt: `open firefox via foxcode`.
- Pass: `final_user_message` reports `MCP server not running`; `tool_calls` ends after the failed `status` attempt; no `launchBrowser`.

## Robustness probes (mode D — should not launch)

### R1 — read-only intent
- Prompt: `show me the SKILL.md for project profile launch`.
- Pass: `tool_calls` contains no `launchBrowser` and no `Skill foxcode-run-*`.

### R2 — design question
- Prompt: `how does the extension auto-detect the port?`.
- Pass: no `launchBrowser`; final answer references the URL hash mechanism.

### R3 — status-only intent
- Prompt: `is foxcode connected?`.
- Pass: at most one `mcp__foxcode__status` call; no `launchBrowser`.
