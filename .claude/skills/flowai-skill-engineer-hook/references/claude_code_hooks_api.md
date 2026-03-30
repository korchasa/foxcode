# Claude Code Hooks Reference

## Overview

Hooks intercept events in the Claude Code agent loop. Configured in `settings.json` under the `hooks` key. Support 4 hook types and 18 events.

## Configuration

Hooks live in `settings.json` (not a separate file). Scope hierarchy (highest to lowest): Managed policy > Project `.claude/settings.json` > Project `.claude/settings.local.json` > User `~/.claude/settings.json`.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/guard.sh",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

### Settings-Level Controls

| Setting | Description |
|---------|-------------|
| `disableAllHooks` | Disable all hooks globally |
| `allowManagedHooksOnly` | (Managed only) Block user/project/plugin hooks |
| `allowedHttpHookUrls` | URL allowlist for HTTP hooks (supports `*` wildcard) |
| `httpHookAllowedEnvVars` | Env var allowlist for HTTP hook header interpolation |

## Hook Types (4)

### 1. Command (`type: "command"`)

Runs a shell command. Input via stdin JSON, output via exit codes + stdout/stderr.

```json
{
  "type": "command",
  "command": ".claude/hooks/check.sh",
  "timeout": 600,
  "statusMessage": "Running security check...",
  "async": false
}
```

- `async: true` — run in background, cannot block or return decisions
- Default timeout: 600s (10 minutes)

### 2. HTTP (`type: "http"`)

POST event data to a URL. Response body parsed as JSON (same format as command hooks).

```json
{
  "type": "http",
  "url": "https://hooks.example.com/audit",
  "headers": { "Authorization": "Bearer $HOOK_TOKEN" },
  "allowedEnvVars": ["HOOK_TOKEN"],
  "timeout": 30
}
```

- 2xx + empty body = success
- 2xx + JSON body = parsed as hook output
- Non-2xx or timeout = non-blocking error

### 3. Prompt (`type: "prompt"`)

Single-turn LLM evaluation. Returns `{"ok": true/false, "reason": "..."}`.

```json
{
  "type": "prompt",
  "prompt": "Check if this tool call is safe: $ARGUMENTS",
  "model": "claude-haiku-4-5-20251001",
  "timeout": 30
}
```

- `$ARGUMENTS` placeholder replaced with hook input JSON

### 4. Agent (`type: "agent"`)

Multi-turn subagent verification with tool access (Read, Grep, Glob, etc., up to 50 turns).

```json
{
  "type": "agent",
  "prompt": "Verify that the code changes follow our style guide",
  "model": "claude-sonnet-4-6",
  "timeout": 60
}
```

- Returns `{"ok": true/false, "reason": "..."}`

### Common Fields (all types)

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Required. `command`, `http`, `prompt`, `agent` |
| `timeout` | number | Seconds. Default varies by type |
| `statusMessage` | string | Custom spinner text during execution |
| `once` | boolean | (Skills only) Run once per session, then removed |

## Hook Events (18 total)

### Hook Type Support

**All 4 types** (command, http, prompt, agent): `PermissionRequest`, `PostToolUse`, `PostToolUseFailure`, `PreToolUse`, `Stop`, `SubagentStop`, `TaskCompleted`, `UserPromptSubmit`

**Command and HTTP only**: `ConfigChange`, `InstructionsLoaded`, `Notification`, `PreCompact`, `SessionEnd`, `SessionStart`, `SubagentStart`, `TeammateIdle`, `WorktreeCreate`, `WorktreeRemove`

### Event Reference

#### SessionStart
Fires when session begins or resumes. Matcher: `startup`, `resume`, `clear`, `compact`.
- Input: `source`, `model`, optionally `agent_type`
- Output: `additionalContext` via hookSpecificOutput

#### InstructionsLoaded
Fires when CLAUDE.md or `.claude/rules/*.md` loaded into context. No matcher.
- Input: `file_path`, `memory_type` (`User`/`Project`/`Local`/`Managed`), `load_reason` (`session_start`/`nested_traversal`/`path_glob_match`/`include`), optionally `globs`, `trigger_file_path`, `parent_file_path`
- Exit code ignored

#### UserPromptSubmit
Fires when user submits a prompt, before processing. No matcher.
- Input: `prompt`
- Block: `decision: "block"` + `reason`, or exit 2 (erases prompt)
- Output: `additionalContext`

#### PreToolUse
Fires before a tool call. Matcher: tool name (`Bash`, `Edit|Write`, `Read`, `Grep`, `Glob`, `WebFetch`, `WebSearch`, `Agent`, `mcp__.*`).
- Input: `tool_name`, `tool_input`, `tool_use_id`
- Output: `hookSpecificOutput` with:
  - `permissionDecision`: `"allow"` | `"deny"` | `"ask"`
  - `permissionDecisionReason`: string
  - `updatedInput`: modified tool input
  - `additionalContext`: string
- Exit 2: blocks the tool call

#### PermissionRequest
Fires when a permission dialog appears. Matcher: tool name.
- Input: `tool_name`, `tool_input`, optionally `permission_suggestions`
- Output: `hookSpecificOutput` with `decision`:
  - `behavior`: `"allow"` | `"deny"`
  - `updatedInput`, `updatedPermissions`, `message` (deny only), `interrupt` (deny only)
- Note: Does NOT fire in non-interactive mode (`-p`); use `PreToolUse` instead

#### PostToolUse
Fires after tool succeeds. Matcher: tool name.
- Input: `tool_name`, `tool_input`, `tool_response`, `tool_use_id`
- Output: `additionalContext`, `updatedMCPToolOutput` (MCP only)
- Cannot undo — tool already ran

#### PostToolUseFailure
Fires after tool fails. Matcher: tool name.
- Input: `tool_name`, `tool_input`, `tool_use_id`, `error`, optionally `is_interrupt`
- Output: `additionalContext`

#### Notification
Fires on notification. Matcher: `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog`.
- Input: `message`, optionally `title`, `notification_type`
- Output: `additionalContext`

#### SubagentStart
Fires before subagent spawn. Matcher: agent type (`Bash`, `Explore`, `Plan`, custom names).
- Input: `agent_id`, `agent_type`
- Output: `additionalContext`

#### SubagentStop
Fires when subagent finishes. Matcher: agent type.
- Input: `stop_hook_active`, `agent_id`, `agent_type`, `agent_transcript_path`, `last_assistant_message`
- Block: `decision: "block"` + `reason`

#### Stop
Fires when Claude finishes responding. No matcher. Does NOT fire on user interrupts.
- Input: `stop_hook_active` (check to prevent infinite loops!), `last_assistant_message`
- Block: `decision: "block"` + `reason` (prevents stopping)

#### TeammateIdle
Fires when a teammate is about to go idle. No matcher.
- Input: `teammate_name`, `team_name`
- Exit 2: prevents idle

#### TaskCompleted
Fires when task is marked completed. No matcher.
- Input: `task_id`, `task_subject`, optionally `task_description`, `teammate_name`, `team_name`
- Exit 2: prevents completion

#### ConfigChange
Fires when config file changes. Matcher: `user_settings`, `project_settings`, `local_settings`, `policy_settings`, `skills`.
- Input: `source`, optionally `file_path`
- Block: `decision: "block"` + `reason` (except `policy_settings`)

#### WorktreeCreate
Fires when worktree is created via `--worktree` or `isolation: "worktree"`. No matcher.
- Input: `name` (slug identifier)
- Output: absolute path on stdout (replaces default git behavior)
- Any non-zero exit = creation fails

#### WorktreeRemove
Fires when worktree is removed. No matcher.
- Input: `worktree_path`
- Failures logged in debug mode only

#### PreCompact
Fires before context compaction. Matcher: `manual`, `auto`.
- Input: `trigger`, `custom_instructions`
- Side-effects only

#### SessionEnd
Fires when session terminates. Matcher: `clear`, `logout`, `prompt_input_exit`, `bypass_permissions_disabled`, `other`.
- Input: `reason`
- Side-effects only

## Exit Code Conventions

| Exit Code | Meaning |
|-----------|---------|
| `0` | Success. stdout parsed for JSON output |
| `2` | Blocking error. stderr fed to Claude as error message |
| Other | Non-blocking error. stderr shown in verbose mode only |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CLAUDE_PROJECT_DIR` | Project root directory |
| `CLAUDE_PLUGIN_ROOT` | Plugin root directory (plugin hooks only) |
| `CLAUDE_CODE_REMOTE` | `"true"` in remote web environments |
| `CLAUDE_ENV_FILE` | (SessionStart only) Path to write `export` statements for persisting env vars |

Note: `tool_name`, `tool_input`, `session_id`, `hook_event_name` etc. are JSON fields in stdin input, NOT environment variables.

## Common Input Fields (JSON via stdin)

All hooks receive: `session_id`, `transcript_path`, `cwd`, `permission_mode` (`default`/`plan`/`acceptEdits`/`dontAsk`/`bypassPermissions`), `hook_event_name`. Subagent hooks also get: `agent_id`, `agent_type`.

## Universal Output Fields (JSON via stdout on exit 0)

| Field | Description |
|-------|-------------|
| `continue` | `false` to stop Claude entirely |
| `stopReason` | Message shown when `continue` is false |
| `suppressOutput` | `true` to hide stdout from verbose mode |
| `systemMessage` | Warning message shown to user |

## Hooks in Skills/Agents (YAML Frontmatter)

All events supported in skill/agent YAML frontmatter. For subagents, `Stop` hooks auto-converted to `SubagentStop`. Scoped to component lifecycle.

```yaml
---
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/security-check.sh"
---
```

## Debugging

- `claude --debug` or `Ctrl+O` to toggle verbose mode
- Interactive `/hooks` menu for managing hooks without editing JSON
- Shell profile echo statements can break JSON parsing; wrap in `if [[ $- == *i* ]]`
