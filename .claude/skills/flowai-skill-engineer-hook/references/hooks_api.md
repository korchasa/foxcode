# Cursor Hooks Reference

## Overview

Hooks let you observe, control, and extend the agent loop using custom scripts. They run before or after defined stages of the agent loop and can observe, block, or modify behavior.

## Hook Events (20 total)

### Session Lifecycle
- **`sessionStart`**: New composer conversation created. Use to set env vars, inject context. Output: `env`, `additional_context`, `continue`.
- **`sessionEnd`**: Conversation ends. Reason: `completed`, `aborted`, `error`, `window_close`, `user_close`. Fire-and-forget.

### Tool Execution
- **`preToolUse`**: Before ANY tool execution. Matcher: tool type (`Shell`, `Read`, `Write`, `Grep`, `Delete`, `Task`, `MCP:<name>`). Can allow/deny or modify input.
- **`postToolUse`**: After successful tool execution. Output: `updated_mcp_tool_output`, `additional_context`.
- **`postToolUseFailure`**: Tool fails, times out, or is denied. Fire-and-forget.

### Shell & MCP Commands
- **`beforeShellExecution`**: Terminal commands. Matcher: regex on command text. Supports `allow`, `deny`, `ask`. Output: `permission`, `user_message`, `agent_message`.
- **`afterShellExecution`**: After shell command completes. Input includes output and duration. Fire-and-forget.
- **`beforeMCPExecution`**: MCP tool calls. Fail-closed. Supports `allow`, `deny`, `ask`.
- **`afterMCPExecution`**: After MCP tool completes. Input includes result JSON. Fire-and-forget.

### File Operations (Agent)
- **`beforeReadFile`**: Before file read. Can block access. Fail-closed. Matcher: `TabRead` or `Read`.
- **`afterFileEdit`**: After file edit. Matcher: `TabWrite` or `Write`. Fire-and-forget.

### Subagent (Task Tool) Lifecycle
- **`subagentStart`**: Before spawning subagent. Matcher: `generalPurpose`, `explore`, `shell`. Input: `subagent_type`, `is_parallel_worker`, `git_branch`. Can allow/deny.
- **`subagentStop`**: Subagent completes or errors. Input: `modified_files`, `agent_transcript_path`, `loop_count`, `tool_call_count`, `message_count`. Output: `followup_message`.

### Agent Loop & UI
- **`beforeSubmitPrompt`**: After user sends, before backend. Matcher: `UserPromptSubmit`. Can prevent submission via `continue: false`.
- **`afterAgentResponse`**: After assistant message. Matcher: `AgentResponse`. Fire-and-forget.
- **`afterAgentThought`**: After thinking block. Matcher: `AgentThought`. Fire-and-forget.
- **`preCompact`**: Before context compaction. Input: `trigger` (auto/manual), `context_usage_percent`, `context_tokens`, `context_window_size`, `message_count`, `messages_to_compact`, `is_first_compaction`. Observational only.
- **`stop`**: Agent loop ends. Input: `stop_hook_active`. Output: `followup_message` to continue loop.

### Cursor Tab (Inline Completions)
- **`beforeTabFileRead`**: Control file access for Tab completions. Can allow/deny.
- **`afterTabFileEdit`**: After Tab edit. Input includes `range` (start/end line/column), `old_line`, `new_line`.

## Configuration

Hooks defined in `hooks.json`. Priority (highest to lowest): Enterprise > Team (cloud) > Project > User.

- Project: `.cursor/hooks.json`
- User: `~/.cursor/hooks.json`

```json
{
  "version": 1,
  "hooks": {
    "afterFileEdit": [{ "command": ".cursor/hooks/format.sh" }],
    "beforeShellExecution": [
      {
        "command": ".cursor/hooks/approve.sh",
        "matcher": "curl|wget",
        "failClosed": true
      }
    ]
  }
}
```

### Hook Object Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `command` | string | required | Shell command or script path |
| `type` | `"command"` \| `"prompt"` | `"command"` | Execution type |
| `timeout` | number (seconds) | - | Max execution time |
| `matcher` | string/object | - | Regex filter for when hook fires |
| `failClosed` | boolean | `false` | Block action if hook fails |
| `loop_limit` | number \| null | `5` | Max auto-followups (stop/subagentStop only). null = unlimited |

## Execution Types

1. **Command-based**: Shell script receives JSON via stdin, returns JSON via stdout.
   - Exit `0`: Success (parse stdout JSON).
   - Exit `2`: Block/deny action.
   - Other: Failure (fail-open unless `failClosed: true`).

2. **Prompt-based**: LLM-evaluated condition. Returns `{ok, reason?}`.
   ```json
   { "type": "prompt", "prompt": "Is this command safe?", "timeout": 10, "model": "gpt-4o-mini" }
   ```
   Supports `$ARGUMENTS` placeholder for hook input JSON.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CURSOR_PROJECT_DIR` | Project root directory |
| `CURSOR_VERSION` | Cursor version |
| `CURSOR_USER_EMAIL` | User email (nullable) |
| `CURSOR_TRANSCRIPT_PATH` | Conversation transcript path (nullable) |
| `CURSOR_CODE_REMOTE` | Set in remote environments |
| `CLAUDE_PROJECT_DIR` | Compatibility alias for CURSOR_PROJECT_DIR |

Session-scoped env vars set via `sessionStart` output `env` field persist for all subsequent hooks in that session.

## Common Input Fields (JSON via stdin)

All hooks receive: `conversation_id`, `generation_id`, `model`, `hook_event_name`, `cursor_version`, `workspace_roots`, `user_email` (nullable), `transcript_path` (nullable).

## Common Output Fields (JSON via stdout)

| Field | Used By | Description |
|-------|---------|-------------|
| `permission` | beforeShellExecution, beforeMCPExecution | `"allow"` \| `"deny"` \| `"ask"` |
| `decision` | preToolUse | `"allow"` \| `"deny"` |
| `updated_input` | preToolUse | Modified tool input object |
| `user_message` | blocking events | Shown to user |
| `agent_message` | blocking events | Fed to agent |
| `followup_message` | stop, subagentStop | Auto-continue message |
| `continue` | sessionStart, beforeSubmitPrompt | `false` to prevent action |
| `env` | sessionStart | Env vars for session |
| `additional_context` | sessionStart, postToolUse | Extra context for agent |
| `updated_mcp_tool_output` | postToolUse | Modified MCP result |

## Claude Code Compatibility

Cursor supports loading Claude Code hooks from `.claude/settings.json` (requires "Third-party skills" enabled in Settings > Features).

Event mapping: `PreToolUse` -> `preToolUse`, `PostToolUse` -> `postToolUse`, `UserPromptSubmit` -> `beforeSubmitPrompt`, `Stop` -> `stop`, `SubagentStop` -> `subagentStop`, `SessionStart` -> `sessionStart`, `SessionEnd` -> `sessionEnd`, `PreCompact` -> `preCompact`.

Tool name mapping: `Bash` -> `Shell`, `Read` -> `Read`, `Write` -> `Write/Edit`, `Grep` -> `Grep`, `Task` -> `Task`. No Cursor equivalent for `Glob`, `WebFetch`, `WebSearch`.

Unsupported Claude Code features: `Notification`, `PermissionRequest` events.
