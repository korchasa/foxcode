# OpenCode Plugins Reference

## Overview

OpenCode uses a **plugin system** (not config-file hooks). Plugins are JS/TS modules that return a `Hooks` object with handler functions. Fundamentally different from Cursor/Claude Code declarative configs.

Package: `@opencode-ai/plugin` (v1.2.21+, MIT, ES module).

## Plugin Structure

A plugin is an async function receiving context and returning a `Hooks` object:

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export default (async ({ project, client, $, directory, worktree }) => {
  return {
    // hook handlers here
  }
}) satisfies Plugin
```

### Context Parameters

| Parameter | Description |
|-----------|-------------|
| `project` | Current project metadata |
| `client` | API client for logging via `client.app.log()` |
| `$` | Bun's shell API for executing commands |
| `directory` | Project directory path |
| `worktree` | Worktree path (if applicable) |

## Distribution

### Local Plugins

Place `.js` or `.ts` files in:
- Project: `.opencode/plugins/`
- Global: `~/.config/opencode/plugins/`

Load order: global config -> project config -> global plugin dir -> project plugin dir.

### npm Plugins

List package names in `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-helicone-session", "@my-org/custom-plugin"]
}
```

Bun auto-installs at startup. Cached in `~/.cache/opencode/node_modules/`.

For local dependencies, add `.opencode/package.json` - OpenCode runs `bun install` at startup.

## Hooks (17 hook points)

Hooks are return object keys. Each receives typed input and returns a value.

### Core Hooks

| Hook | Purpose | Can Block? |
|------|---------|-----------|
| `tool.execute.before` | Modify tool arguments before execution | Yes (return modified args) |
| `tool.execute.after` | Transform tool results after execution | No (post-execution) |
| `tool.definition` | Modify tool definitions sent to LLM | No |
| `tool` | Register custom tool definitions (map of name -> ToolDefinition) | - |
| `command.execute.before` | Pre-command execution | Yes |
| `permission.ask` | Handle permission requests | Yes |
| `shell.env` | Inject environment variables | - |
| `event` | Generic handler for ALL system events | No |
| `config` | Configuration processing | - |
| `auth` | Authentication setup (OAuth, API key) | - |

### Chat Hooks

| Hook | Purpose |
|------|---------|
| `chat.message` | Called on new message received |
| `chat.params` | Modify parameters sent to LLM |
| `chat.headers` | Custom HTTP headers for LLM requests |

### Experimental Hooks

| Hook | Purpose |
|------|---------|
| `experimental.chat.messages.transform` | Message pipeline modification |
| `experimental.chat.system.transform` | System prompt customization |
| `experimental.session.compacting` | Session compaction prompt customization |
| `experimental.text.complete` | Text completion augmentation |

## System Events (via `event` hook)

Subscribe to system events through the generic `event` hook handler:

```typescript
event: async (event) => {
  if (event.type === "file.edited") {
    // handle file edit
  }
}
```

### Event Categories

| Category | Events |
|----------|--------|
| Command | `command.executed` |
| File | `file.edited`, `file.watcher.updated` |
| Installation | `installation.updated` |
| LSP | `lsp.client.diagnostics`, `lsp.updated` |
| Message | `message.part.removed`, `message.part.updated`, `message.removed`, `message.updated` |
| Permission | `permission.asked`, `permission.replied` |
| Server | `server.connected` |
| Session | `session.created`, `session.compacted`, `session.deleted`, `session.diff`, `session.error`, `session.idle`, `session.status`, `session.updated` |
| Todo | `todo.updated` |
| Shell | `shell.env` |
| Tool | `tool.execute.after`, `tool.execute.before` |
| TUI | `tui.prompt.append`, `tui.command.execute`, `tui.toast.show` |

## Custom Tools via `tool()` Helper

Create custom tools using `tool()` from `@opencode-ai/plugin/tool`:

```typescript
import { tool } from "@opencode-ai/plugin/tool"

const myTool = tool({
  description: "Does something useful",
  args: {
    input: tool.schema.string(),
    count: tool.schema.number().optional(),
  },
  async execute(args, context) {
    // args.input: string, args.count: number | undefined
    // context: { sessionID, messageID, agent, directory, worktree, metadata(), ask() }
    return "result as string"
  },
})
```

Register in plugin return:

```typescript
export default (async (ctx) => ({
  tool: { myToolName: myTool },
})) satisfies Plugin
```

- `tool.schema` exposes Zod for schema construction
- `context.metadata()` attaches descriptive info to invocation
- `context.ask()` requests user permissions
- Plugin tools take precedence over built-in tools with matching names

## Logging

```typescript
client.app.log({
  body: { level: "info", message: "Hook fired", extra: { detail: "..." } }
})
```

Levels: `debug`, `info`, `warn`, `error`.

## Complete Example: Guard Plugin

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export default (async ({ client }) => {
  return {
    "tool.execute.before": async (input) => {
      // Block dangerous shell commands
      if (input.tool === "bash" && input.args?.command?.includes("rm -rf")) {
        client.app.log({ body: { level: "warn", message: "Blocked rm -rf" } })
        return { ...input, args: { command: "echo 'Blocked: rm -rf not allowed'" } }
      }
      return input
    },
    "shell.env": async () => ({
      NODE_ENV: "development",
      CUSTOM_VAR: "value",
    }),
    event: async (event) => {
      if (event.type === "file.edited") {
        client.app.log({ body: { level: "info", message: `File edited: ${event.properties?.path}` } })
      }
    },
  }
}) satisfies Plugin
```

## .opencode Directory Structure

```
.opencode/
  plugins/          # Local plugin JS/TS files
  package.json      # Dependencies (bun install at startup)
  agents/
  commands/
  modes/
  skills/
  tools/
  themes/
```
