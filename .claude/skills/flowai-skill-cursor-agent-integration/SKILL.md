---
name: flowai-skill-cursor-agent-integration
description: Understand and interact with the cursor-agent CLI, including its output formats (JSON, text, stream-json), session management (resume), and integration with benchmarks. Use when working on cursor-agent CLI, benchmark runners, or automated agent interactions.
---

# Cursor Agent Integration

This skill provides technical details for interacting with the `cursor-agent` CLI, the primary interface for the flowai AI agent.

## CLI Overview

`cursor-agent` is a CLI tool for autonomous task execution, tool usage, and interactive sessions.

## Output Formats

When using the `--print` flag, specify the format with `--output-format`:

- **text** (default): Human-readable stream of tool logs and assistant responses.
- **json**: A single JSON object printed at the end of the process. Ideal for automated parsing.
- **stream-json**: A stream of JSON events emitted during execution.

## JSON Output Structure

In `--output-format json` mode, the CLI returns a single object:

```json
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "duration_ms": 4032,
  "result": "Final assistant response text",
  "session_id": "uuid-string",
  "messages": [
    { "type": "assistant", "content": "..." },
    { "type": "user", "content": "..." }
  ]
}
```

### Key Fields

- `session_id`: Unique identifier for the chat session.
- `result`: The final text response from the agent.
- `subtype`: Completion status (`success`, `error`, `input_required`).
- `messages`: Full conversation history for the session.

## Session Lifecycle & Resume

1. **Initial Run**: Agent executes until task completion or user input is needed.
2. **Input Required**: If `subtype` is `input_required`, the agent exits and waits for further instruction.
3. **Resuming**: Use `cursor-agent <new_prompt> --resume <session_id>` to continue a session. The agent loads history based on the ID.

## Benchmark Integration

- **Parsing**: In `json` mode, wait for process exit and parse the entire output (or the last line) as a single JSON object.
- **State Management**: The `session_id` is the source of truth for state. Benchmarks should capture this ID to chain multiple agent calls.
- **Mocking**: Use Cursor Hooks to mock tools during benchmarks, preventing side effects from dangerous commands.
