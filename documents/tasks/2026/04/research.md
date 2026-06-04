# Research: Claude Code Internals

Date: 2026-04-05
Source: decompiled Claude Code CLI (`claude-code` sandbox)

---

## 1. System Prompt Composition with `--agent`

When `--agent <name>` is used, the agent's markdown body **replaces the default system prompt sections** (~17 sections). However, other context channels survive — CLAUDE.md, git status, and tool descriptions are injected separately and remain available.

### Default System Prompt Structure

`getSystemPrompt()` in `constants/prompts.ts:444-577` returns **~17 sections** (not 8):

**Static (7, lines 560-572):**
1. `getSimpleIntroSection()` — "You are Claude Code, Anthropic's official CLI..."
2. `getSimpleSystemSection()` — system rules (sandbox, output)
3. `getSimpleDoingTasksSection()` — doing tasks (conditional on outputStyle)
4. `getActionsSection()` — safety, reversibility, blast radius
5. `getUsingYourToolsSection()` — tool usage rules
6. `getSimpleToneAndStyleSection()` — tone and style
7. `getOutputEfficiencySection()` — "Keep your text output brief..."

**Dynamic (10+, lines 491-555, resolved via `resolveSystemPromptSections()`):**
8. `session_guidance` — skills inventory, agent tool tips
9. `memory` — `loadMemoryPrompt()` (auto-memory MEMORY.md, NOT CLAUDE.md)
10. `ant_model_override` — ant-only model override
11. `env_info_simple` — OS, CWD, model name, knowledge cutoff
12. `language` — response language setting
13. `output_style` — custom output style config
14. `mcp_instructions` — MCP server instructions (uncached, servers change between turns)
15. `scratchpad` — scratchpad instructions
16. `frc` — function result clearing rules
17. `summarize_tool_results` — tool result summary rules
18. `token_budget` — token budget instructions (feature-gated)
19. `numeric_length_anchors` — numeric length limits (ant-only)
20. `brief` — brief mode (KAIROS-gated)

### Composition Logic

`buildEffectiveSystemPrompt()` in `utils/systemPrompt.ts:115-122`:

```typescript
return asSystemPrompt([
  ...(agentSystemPrompt
    ? [agentSystemPrompt]          // agent REPLACES all ~17 sections above
    : customSystemPrompt
      ? [customSystemPrompt]       // --system-prompt REPLACES all ~17 sections
      : defaultSystemPrompt),      // otherwise: all ~17 sections
  ...(appendSystemPrompt ? [appendSystemPrompt] : []),  // always appended
])
```

### What Survives `--agent` — Depends on Mode

**CRITICAL:** Interactive (REPL) and headless (`-p`) modes handle `--agent` differently:

**Headless (`-p`) mode** (`cli/print.ts:4399-4402`):
```typescript
// Agent body is assigned to customSystemPrompt:
if (!options.systemPrompt && !isBuiltInAgent(mainThreadAgent)) {
  const agentSystemPrompt = mainThreadAgent.getSystemPrompt()
  if (agentSystemPrompt) {
    options.systemPrompt = agentSystemPrompt  // → customSystemPrompt
  }
}
```
Then `fetchSystemPromptParts()` (`queryContext.ts:61-72`) sees `customSystemPrompt !== undefined` and **skips both `getSystemPrompt()` and `getSystemContext()`**:
```typescript
const [defaultSystemPrompt, userContext, systemContext] = await Promise.all([
  customSystemPrompt !== undefined
    ? Promise.resolve([])           // skip default prompt
    : getSystemPrompt(...),
  getUserContext(),                  // ALWAYS loaded (CLAUDE.md)
  customSystemPrompt !== undefined
    ? Promise.resolve({})           // skip systemContext (git status)
    : getSystemContext(),
])
```

**Interactive (REPL) mode** (`screens/REPL.tsx:2768-2787`):
```typescript
// ALWAYS loads all three — no customSystemPrompt gate:
const [,, defaultSystemPrompt, baseUserContext, systemContext] = await Promise.all([
  ..., getSystemPrompt(...), getUserContext(), getSystemContext()
])
// Then buildEffectiveSystemPrompt() replaces defaultSystemPrompt with agent body
const systemPrompt = buildEffectiveSystemPrompt({
  mainThreadAgentDefinition, ..., defaultSystemPrompt, ...
})
```
Here `systemContext` (git status) is loaded and appended to agent body via `appendSystemContext()`.

**Channel summary by mode:**

| Channel | Content | Headless `-p` + `--agent` | Interactive + `--agent` |
|:---|:---|:---|:---|
| systemPrompt | Agent body replaces ~17 default sections | **Yes** (via `options.systemPrompt`) | **Yes** (via `buildEffectiveSystemPrompt`) |
| systemContext | Git status (branch, commits) | **No** (skipped: `queryContext.ts:71`) | **Yes** (always loaded: `REPL.tsx:2772`) |
| userContext | CLAUDE.md + date | **Yes** (always loaded: `queryContext.ts:70`) | **Yes** (always loaded: `REPL.tsx:2772`) |
| tools param | Tool schemas + descriptions | **Yes** (API param, independent) | **Yes** (API param, independent) |

**Channel details:**

**systemContext** (`context.ts:116-150`): `getSystemContext()` returns `{ gitStatus: "..." }` — branch, status, recent commits. Appended to system prompt via `appendSystemContext()` (`utils/api.ts:437-447`):
```typescript
export function appendSystemContext(systemPrompt, context) {
  return [...systemPrompt, Object.entries(context).map(([k, v]) => `${k}: ${v}`).join('\n')].filter(Boolean)
}
```

**userContext** (`context.ts:155-189`): `getUserContext()` returns `{ claudeMd: "...", currentDate: "..." }`. Prepended as synthetic user message via `prependUserContext()` (`utils/api.ts:449-469`):
```
<system-reminder>
As you answer the user's questions, you can use the following context:
# claudeMd
<contents of all CLAUDE.md files from hierarchy>
# currentDate
Today's date is 2026-04-05.

IMPORTANT: this context may or may not be relevant to your tasks...
</system-reminder>
```

**tools API parameter** (always present): Tool schemas passed via `tools` API param, not inside system prompt. Tool descriptions (e.g. FileEditTool's "ALWAYS prefer editing existing files" at `tools/FileEditTool/prompt.ts:24`) are always visible.

Note: `loadMemoryPrompt()` in dynamic section #9 is auto-memory (`memdir/memdir.ts:419`), NOT CLAUDE.md. CLAUDE.md is loaded exclusively through `getUserContext()` → `getClaudeMds()` → userContext channel.

### Flag Combinations (Headless `-p` Mode)

Evidence: `cli/print.ts:4392-4404` (agent → customSystemPrompt), `queryContext.ts:61-72` (customSystemPrompt gates), `QueryEngine.ts:321-324` (assembly).

| Flags | System prompt | systemContext (git) | userContext (CLAUDE.md) |
| :--- | :--- | :--- | :--- |
| (none) | Default (~17 sections) | Yes | Yes |
| `--agent A` | Agent body only | **No** (skipped) | Yes |
| `--system-prompt X` | X only | **No** (skipped) | Yes |
| `--agent A --system-prompt X` | X wins (agent ignored, `print.ts:4399` check) | **No** | Yes |
| `--agent A --append-system-prompt Y` | Agent body + Y | **No** | Yes |
| `--append-system-prompt Y` | Default + Y | Yes | Yes |

### Flag Combinations (Interactive REPL Mode)

Evidence: `screens/REPL.tsx:2768-2787` (unconditional loading), `utils/systemPrompt.ts:115-122` (replacement logic).

| Flags | System prompt | systemContext (git) | userContext (CLAUDE.md) |
| :--- | :--- | :--- | :--- |
| (none) | Default (~17 sections) | Yes | Yes |
| `--agent A` | Agent body only | **Yes** (always loaded) | Yes |
| `--system-prompt X` | X only | **Yes** (always loaded) | Yes |
| `--agent A --append-system-prompt Y` | Agent body + Y | **Yes** | Yes |

Note: `--agent` requires a registered agent name (from `.claude/agents/`), not a file path. File paths silently fall through to default mode. Evidence: `cli/print.ts:4392` looks up `options.agent` in `agents` array; unmatched names skip agent setup.

### Experimental Verification (2026-04-05)

**Test 1: Static sections dropped** — pirate agent (`.claude/agents/pirate.md`) in `/tmp`, headless `-p` mode:

| Marker phrase | Source section | Default | --agent pirate |
|:---|:---|:---|:---|
| "Claude Code, Anthropic official CLI" | Static: Intro | Yes | **No** |
| "reversibility and blast radius" | Static: Actions | Yes | **No** |
| "Keep your text output brief" | Static: Output efficiency | Yes | **No** |
| "powered by the model" | Dynamic: env_info | Yes | **No** |
| "Session-specific guidance" | Dynamic: session_guidance | Yes | **No** |
| "You are a pirate captain" | Agent body | No | **Yes** |
| "Captain Blackbeard" | Agent body | No | **Yes** |
| "ALWAYS prefer editing existing files" | Tool description (`FileEditTool/prompt.ts:24`) | Yes | **Yes** |

Token counts: default cache_creation=14947, agent cache_creation=11707 (3240 fewer — matches dropped sections).

**Test 2: Git status (systemContext) skipped in `-p` mode** — fresh git repo `/tmp/gitrepo`:

| Mode | "git branch in context?" | Evidence |
|:---|:---|:---|
| Default (`-p`) | **Yes** | systemContext loaded |
| `--agent pirate` (`-p`) | **No** | systemContext skipped (`queryContext.ts:71`) |
| `--system-prompt X` (`-p`) | **No** | systemContext skipped (`queryContext.ts:71`) |

**Test 3: `--agent` with file path silently ignored** — `/tmp/pirate-agent.md` as file path:
- `claude --agent /tmp/pirate-agent.md -p "What is your name?"` → "I'm Claude" (agent not loaded, default mode)
- `claude --agent pirate -p "What is your name?"` → "Arrr! Captain Blackbeard" (agent loaded from `.claude/agents/`)

---

## 2. Skill System

### Skill Loading

File: `skills/loadSkillsDir.ts` — core skill loader.
Loads from (via `getSkillsPath()`, lines 78-93): `~/.claude/skills/`, `.claude/skills/`, `.claude/commands/`, `~/.claude/commands/`, and **managed/policy path** (`${getManagedFilePath()}/.claude/skills/` and `commands/`). The policy source was missing from prior documentation.

### Frontmatter Fields

Parsed in `skills/loadSkillsDir.ts`:

```yaml
name: string           # display name
description: string    # used for model matching
whenToUse: string      # hint for model when to invoke
allowed-tools: string  # permission rule syntax, e.g. "Bash(deno:*)" (note: hyphenated key)
model: string          # sonnet/opus/haiku/inherit
effort: number         # any integer (no 1-5 range constraint) or 'low'|'medium'|'high'|'max'
context: string        # "inline" (default) | "fork" (isolated subagent)
agent: string          # specific agent type for fork execution
paths: string[]        # file paths to include in context
hooks: object          # pre/post execution hooks
disable-model-invocation: bool  # user-only; NOT in FrontmatterData type, parsed separately at loadSkillsDir.ts:256
```

Note: `disallowedTools` does NOT exist in FrontmatterData or loadSkillsDir.ts. The field `allowed-tools` is hyphenated (not camelCase). Evidence: `utils/frontmatterParser.ts:10-59` — FrontmatterData type definition.

### Argument Substitution

Skills support positional arguments: `/skillname arg1 arg2` → `$0` (skillname), `$1` (arg1), `$2` (arg2) substituted in skill prompt text.

### Context Modes

- `context: "inline"` (default) — expands prompt into current conversation
- `context: "fork"` — spawns isolated subagent with separate token budget

### Bundled Skills with Reference Files

`skills/bundledSkills.ts` — bundled skills can include reference files extracted to disk on first invocation:

```typescript
files?: {
  'relative/path.ts': 'file content',
  'nested/file.md': '# Markdown'
}
```

Skill prompt gets prefixed with base directory hint for model to discover files.

---

## 3. Agent System

### Agent Definition

File: `tools/AgentTool/loadAgentsDir.ts` — type `BaseAgentDefinition`:

```typescript
type BaseAgentDefinition = {
  agentType: string
  whenToUse: string
  tools?: string[]
  disallowedTools?: string[]
  skills?: string[]          // preloaded slash commands
  mcpServers?: AgentMcpServerSpec[]
  hooks?: HooksSettings
  model?: string
  effort?: EffortValue       // any integer (no 1-5 clamp) or 'low'|'medium'|'high'|'max'
  permissionMode?: PermissionMode
  maxTurns?: number
  initialPrompt?: string     // prepended to first turn
  memory?: 'user' | 'project' | 'local'  // persistent memory scope
  isolation?: 'worktree' | 'remote'       // git worktree isolation
  omitClaudeMd?: boolean     // skip CLAUDE.md hierarchy
}
```

### Built-in Agent Types

File: `tools/AgentTool/built-in/` — **6 agent files**, dynamically gated (evidence: `builtInAgents.ts:22-72`):

| Agent | File | Always active? |
|:---|:---|:---|
| `generalPurposeAgent` | generalPurposeAgent.ts | **Yes** |
| `statuslineSetup` | statuslineSetup.ts | **Yes** |
| `exploreAgent` | exploreAgent.ts | Gated: `areExplorePlanAgentsEnabled()` |
| `planAgent` | planAgent.ts | Gated: `areExplorePlanAgentsEnabled()` |
| `claudeCodeGuideAgent` | claudeCodeGuideAgent.ts | Gated: non-SDK entrypoint |
| `verificationAgent` | verificationAgent.ts | Gated: `VERIFICATION_AGENT` flag + GrowthBook |

### Agent Spawning

Files: `tools/AgentTool/AgentTool.tsx`, `tools/AgentTool/forkSubagent.ts`, `tools/AgentTool/runAgent.ts`

Model calls `subagent_type` parameter. Subagent runs with:
- Isolated conversation history (fork option shares full context)
- Optional background execution (`run_in_background: true`)
- Separate budget/turn tracking
- Permission mode bubbling (child prompts visible in parent terminal)

### Fork Subagent

Feature gate: `FORK_SUBAGENT`. When `subagent_type` omitted → fork mode.
Fork inherits full parent context. Prompt cache optimization: identical placeholder results across fork children (`FORK_PLACEHOLDER_RESULT` in `forkSubagent.ts`).

---

## 4. Hook System

### Hook Events

File: `entrypoints/sdk/coreTypes.ts:25-53` — **27 events** (not 17):

| Event | When |
|:---|:---|
| `PreToolUse` | before tool execution |
| `PostToolUse` | after tool execution |
| `PostToolUseFailure` | after tool fails |
| `Notification` | notification |
| `UserPromptSubmit` | user sends message |
| `SessionStart` | session begins |
| `SessionEnd` | session ends |
| `Stop` | agent stop |
| `StopFailure` | agent stop failed |
| `SubagentStart` | subagent spawned |
| `SubagentStop` | subagent finished |
| `PreCompact` | before context compaction |
| `PostCompact` | after context compaction |
| `PermissionRequest` | permission prompt shown |
| `PermissionDenied` | permission denied |
| `Setup` | initial setup (init/maintenance) |
| `TeammateIdle` | teammate agent idle |
| `TaskCreated` | background task created |
| `TaskCompleted` | background task completed |
| `Elicitation` | elicitation prompt |
| `ElicitationResult` | elicitation answered |
| `ConfigChange` | settings changed |
| `WorktreeCreate` | git worktree created |
| `WorktreeRemove` | git worktree removed |
| `InstructionsLoaded` | CLAUDE.md loaded |
| `CwdChanged` | working directory changed |
| `FileChanged` | file modified |

### Hook Types

File: `schemas/hooks.ts:176-188` — **4 types in schema** (discriminatedUnion):

1. **Command** (lines 32-65) — shell script
2. **Prompt** (lines 67-95) — LLM evaluation (`$ARGUMENTS` placeholder for JSON input)
3. **HTTP** (lines 97-126) — POST JSON, expect JSON response
4. **Agent** (lines 128-163) — agentic verifier (runs with specified model)

**Function** hooks exist as a separate `FunctionHook` type in runtime but are **excluded from the persisted schema** (comment at line 173-174: "excludes function hooks - they can't be persisted").

### Hook Features

- `async: true` — background execution
- `asyncRewake: true` — background + wake model on error
- `once: true` — remove after first execution
- `if: "Tool(pattern)"` — conditional filtering via permission rule syntax
- `timeout: number` — per-hook timeout in seconds
- `statusMessage: string` — custom spinner text

### Hook JSON Output Protocol

File: `utils/hooks.ts` — `executeHook()`:

```typescript
{
  continue?: boolean           // whether to continue (default true)
  suppressOutput?: boolean     // hide stdout
  stopReason?: string          // message when continue=false
  decision?: 'approve' | 'block'
  reason?: string
  systemMessage?: string       // warning to user
  hookSpecificOutput?: {
    hookEventName: string
    permissionDecision?: 'allow' | 'deny' | 'ask'
    updatedInput?: Record<string, unknown>
    additionalContext?: string
  }
}
```

### Hook Configuration Sources

- `settings.json` `hooks` section
- Skill frontmatter `hooks` field
- Agent definition `hooks` field
- Runtime code via `registerPostSamplingHook()`

---

## 5. Permission System

### Permission Rules Syntax

File: `utils/settings/permissionValidation.ts`

```
Tool(pattern)
```

Examples: `Bash(git *)`, `Write(*.ts)`, `Read(src/**)`.

Rule types: `allow`, `deny`, `ask`.

### Permission Modes

File: `utils/permissions/PermissionMode.ts`:

- `default` — ask for permission outside CWD
- `plan` — read-only, ask for changes
- `acceptEdits` — auto-accept file edits
- `dontAsk` — don't ask for permissions (evidence: `types/permissions.ts:16-38`, EXTERNAL_PERMISSION_MODES)
- `bypassPermissions` — auto-approve all
- `auto` — ML classifier-based decision (gated by `TRANSCRIPT_CLASSIFIER` feature flag)

### Dangerous Patterns Detection

File: `utils/permissions/dangerousPatterns.ts` — detects dangerous **permission allow-rule patterns** (interpreters/shells that enable arbitrary code execution: python, node, bash, ssh, etc.), NOT specific commands like `rm -rf` or `git reset --hard`. These patterns feed `isDangerousBashPermission` / `isDangerousPowerShellPermission` in `permissionSetup.ts`, which strip such rules at auto-mode entry. Actual dangerous command detection (rm -rf, git reset --hard, etc.) is handled by the yolo classifier (`utils/permissions/yoloClassifier.ts`).

---

## 6. MCP Integration

### Transport Types

File: `services/mcp/types.ts`:

**TransportSchema enum** (`services/mcp/types.ts:24`): `stdio`, `sse`, `sse-ide`, `http`, `ws`, `sdk`

**Separate config schemas** (not in TransportSchema enum, but in McpServerConfigSchema union at lines 124-134):
- `ws-ide` — `McpWebSocketIDEServerConfigSchema` (line 79)
- `claudeai-proxy` — `McpClaudeAIProxyServerConfigSchema` (line 116)

### Tool Naming

MCP tools prefixed: `mcp__<server>__<tool>` (or unprefixed in `NO_PREFIX` mode).

### MCP Configuration Scopes

File: `services/mcp/config.ts`:

- `local` — env vars
- `user` — `~/.claude/`
- `project` — `.claude/mcp.json`
- `dynamic` — runtime
- `enterprise` — managed/MDM
- `claudeai` — Claude.ai proxy
- `managed` — policy-managed

### Per-Agent MCP

Agent definitions support `mcpServers` field — specific MCP servers for a subagent.

---

## 7. Plugin Architecture

### Plugin Manifest

File: `types/plugin.ts`:

```typescript
{
  name: string
  version: string
  description: string
  skills?: Skill[]
  agents?: Agent[]
  tools?: Tool[]
  hooks?: HookDefinition[]
  mcpServers?: McpServerDefinition[]
  settings?: Record<string, unknown>
}
```

### Plugin Sources

- `~/.claude/plugins/` — user
- `.claude/plugins/` — project
- marketplace (managed)
- policy-managed / policy-denied

---

## 8. Tool System

### Tool Interface

File: `Tool.ts` — key properties:

```typescript
type Tool = {
  name: string
  shouldDefer?: boolean      // lazy-load via ToolSearch
  alwaysLoad?: boolean       // always visible
  isReadOnly(input): boolean
  isDestructive?(input): boolean
  checkPermissions(input, context): Promise<PermissionResult>  // NOT "requiresPermission" — actual name is checkPermissions (Tool.ts:500-503)
  isConcurrencySafe(input): boolean
  maxResultSizeChars: number
}
```

### Deferred Tools (ToolSearch)

Tools with `shouldDefer: true` — schema loaded lazily via `ToolSearch`. Optimizes system prompt size. Model requests schema on demand.

### Built-in Tools (40+)

File: `tools.ts:193-251` — `getAllBaseTools()` returns **19 always-present + 30+ feature-gated** tools. See Section 16 for full list.

---

## 9. Background & Task System

### Background Agents

File: `tools/AgentTool/AgentTool.tsx` — `run_in_background: true`.

Субагент работает асинхронно, результат приходит через notification. Task system (`TaskCreateTool`, `TaskGetTool`, `TaskListTool`) отслеживает фоновые задачи.

### Memory Consolidation ("Dream")

Agents с `memory` scope получают persistent snapshots, консолидируемые в фоне.

---

## 10. CLAUDE.md Hierarchy

### File Loading Hierarchy (lowest → highest priority)

1. **Managed** — `/etc/claude-code/CLAUDE.md` — global instructions for all users
2. **User** — `~/.claude/CLAUDE.md` — private global instructions for all projects
3. **Project** — `CLAUDE.md`, `.claude/CLAUDE.md`, `.claude/rules/*.md` — checked into codebase
4. **Local** — `CLAUDE.local.md` — private project-specific (not committed)
5. **AutoMem** — auto-memory index file
6. **TeamMem** — shared team memory (feature-gated)

### Loading Lifecycle

**Session startup:**
- Entry point: memoized `getUserContext()` in `context.ts:155`
- Called from `main.tsx:405` via `void getUserContext()`
- Files are prefetched before first user prompt to hide I/O latency

**Call chain:**
```
main.tsx → getUserContext() → getClaudeMds(getMemoryFiles())
                                         ↓
                              claudemd.ts:790 — async directory walk
```

**Lazy (per-file):**
- Conditional rules from `.claude/rules/*.md` with `paths:` frontmatter loaded on file access via `memoryFilesToAttachments()` in `attachments.ts:1760`

### Directory Walk Strategy

Core logic in `claudemd.ts:790-1075`:

1. Walks from CWD **upward to root**
2. Processes in reverse — **root to CWD** (files closer to CWD have higher priority)
3. Per directory: `CLAUDE.md`, `.claude/CLAUDE.md`, `.claude/rules/*.md`
4. `@include` directive for file inclusion (with circular reference protection)
5. Worktree handling: skips duplicate checked-in files in nested git worktrees

### Merging

`getClaudeMds()` in `claudemd.ts:1153-1195` wraps each file with source description, combines with `MEMORY_INSTRUCTION_PROMPT` prefix.

### Limits

| Limit | Value | Location |
|:---|:---|:---|
| **Recommended max per file** | **40,000 characters** | `claudemd.ts:92` |
| **`@include` max depth** | **5 levels** | `claudemd.ts:537` |
| **Conditional rule max lines** | **200 lines** per file | `attachments.ts:269` |
| **Conditional rule max bytes** | **4,096 bytes** (4 KB) per file | `attachments.ts:277` |
| **Conditional rules per turn** | up to **5 files** | `attachments.ts:271` (comment) |
| **Aggregate per turn** | ~**20 KB** (5 × 4 KB) | `attachments.ts:272` (comment) |

- Files exceeding `MAX_MEMORY_CHARACTER_COUNT` (40K chars) flagged as "large" with performance warning (`status.tsx:122`)
- `@include` only allows text file extensions (`.md`, `.txt`, etc.) — binary files silently ignored (`claudemd.ts:96`)
- Conditional rule files truncated with note to use `FileReadTool` for full content
- Team memory limits configurable per-org server-side (`claude_code_team_memory_limits`)

### Disabling CLAUDE.md

- `CLAUDE_CODE_DISABLE_CLAUDE_MDS` env var — hard disable
- `--bare` mode (without `--add-dir`) — skips auto-discovery

### Caching

- `getMemoryFiles()` and `getUserContext()` are memoized
- Cache cleared via `clearMemoryFileCaches()` or `resetGetMemoryFilesCache()`

### Auto-attachment

CLAUDE.md files automatically attached from:
- Current directory
- Parent directories (up to root)
- Home directory (`~/.claude/CLAUDE.md`)

Deduplication via session tracking.

### Agent Override

`omitClaudeMd: boolean` — agents can skip CLAUDE.md hierarchy to save context.

---

## 11. Verification of `ides-difference.md` Claims about Claude Code

Date: 2026-04-05
Method: live Claude Code session (Opus 4.6, 1M context) + system prompt introspection + decompiled source cross-reference.

### Confirmed Correct

| Claim (section) | Evidence |
|:---|:---|
| Conditional rules trigger on `Read` only, not `Write`/`Edit` (§2.2) | System prompt confirms; matches [^32] empirical test |
| `globs:` silently ignored (§2.2) | Claude Code uses `paths:`, unknown frontmatter fields dropped |
| `description:` alone → always-apply (§2.2) | Without `paths:`, rule loads unconditionally |
| Hook types: command, http, prompt, agent (§2.4) | System prompt + source `schemas/hooks.ts`. 5th type `function` exists (runtime-only, not user-configurable) |
| Skills paths: `~/.claude/skills/`, `.claude/skills/` (§2.5) | Source `skills/loadSkillsDir.ts` + system prompt |
| MCP config: `.mcp.json`, `~/.claude.json`, `managed-mcp.json` (§2.6) | Source `services/mcp/config.ts` |
| MCP transports: HTTP, SSE (deprecated), stdio (§2.6) | Confirmed. Source also shows ws, sse-ide, ws-ide, sdk, claudeai-proxy |
| Custom agents: `.claude/agents/*.md`, `~/.claude/agents/*.md` (§2.8) | Source + system prompt |
| Session storage: JSONL, `~/.claude/projects/`, `~/.claude/history.jsonl` (§3.10) | Source |
| IDE detection: `CLAUDECODE=1` (§3.9) | Env var present in session |
| Context ignoring: no dedicated file, `.gitignore`, `permissions.deny` (§2.7) | Confirmed |
| Doc URL: `code.claude.com/docs` (§1) | Confirmed |
| Custom commands: `.claude/commands/*.md`, `$1`–`$N` args (§2.3) | Source `skills/loadSkillsDir.ts` |
| Plugin manifest: `.claude-plugin/plugin.json` (§2.10) | Source `types/plugin.ts` |
| Plugin namespacing: `/plugin-name:skill-name` (§2.10) | System prompt lists skills as `plugin:name:skill` |
| Hook config in `settings.json` `hooks` key (§2.4) | Confirmed |

### Incorrect or Outdated

| Claim | Problem | Evidence |
|:---|:---|:---|
| **Tools list** (§1) | **Incomplete.** 19 always-present + 30+ conditional = ~49 total. Missing many: `TodoWrite`, `ToolSearch`, `CronCreate/Delete/List`, `EnterWorktree/ExitWorktree`, `ListMcpResources/ReadMcpResource`, `RemoteTrigger`, `SendMessage` (unconditional at line 226), `ListPeers`, `TeamCreate/Delete`, `PowerShell`, `Snip`, `PushNotification`, `SubscribePR`, `TerminalCapture`, etc. | Source `tools.ts:193-251` `getAllBaseTools()` |
| **"Bash (persistent session)"** (§1) | **Misleading.** CWD persists, shell state (env vars, aliases) does NOT | System prompt: "working directory persists between commands, but shell state does not" |
| **Hook events: 22** (§2.4) | **Incomplete.** Actual count: **27 events** in `entrypoints/sdk/coreTypes.ts:25-53`. Missing from §2.4: `Stop`, `StopFailure`, `PreCompact`, `PostCompact`, `TeammateIdle`, `TaskCreated`, `TaskCompleted`, `WorktreeCreate`, `WorktreeRemove`, `InstructionsLoaded` — all confirmed in source | Source `entrypoints/sdk/coreTypes.ts:25-53` HOOK_EVENTS array |
| **"No subagent nesting"** (§2.8) | **Outdated.** Agents CAN delegate to other agents | Live system prompt: no nesting prohibition |
| **CLAUDE.md: "root/subdir, ~/.claude/CLAUDE.md"** (§2.1) | **Incomplete.** Missing: `CLAUDE.local.md`, `.claude/CLAUDE.md`, managed policy paths (`/Library/Application Support/ClaudeCode/CLAUDE.md`, `/etc/claude-code/CLAUDE.md`) | Source |
| **Built-in agents: 3** (§2.8) | **6 files, dynamically gated:** generalPurpose + statuslineSetup (always), explore + plan (gated: `areExplorePlanAgentsEnabled()`), claudeCodeGuide (non-SDK only), verification (`VERIFICATION_AGENT` flag) | Source `tools/AgentTool/built-in/` (6 files); `builtInAgents.ts:22-72` (gating logic) |
| **Commands vs Skills** (§2.3) | **Merged.** `.claude/commands/` loaded by skill loader. Both work, skills preferred | Source `skills/loadSkillsDir.ts` |

### Missing — Should Be Added

| Feature | Details | Comparison value |
|:---|:---|:---|
| **Permission Modes** | `default`, `plan`, `acceptEdits`, `bypassPermissions`, `auto` (ML classifier) | Core UX differentiator vs Cursor/OpenCode |
| **Worktrees** | `isolation: 'worktree'` in agents; `EnterWorktree/ExitWorktree` tools | Unique to Claude Code |
| **Cron / Scheduled Agents** | `CronCreate/Delete/List`; `/schedule` skill | No Cursor/OpenCode equivalent |
| **Background Agents** | `run_in_background: true`; `background` agent field | Subagents working while user types |
| **Agent Teams** | `TeammateIdle` event, `SendMessage` tool | Multi-agent peer coordination |
| **Elicitation** | `Elicitation`/`ElicitationResult` hook events | MCP servers requesting user input |
| **Memory system** | `memory: 'user'\|'project'\|'local'` in agents; `/memory`; `CLAUDE.local.md` | Persistent cross-session state |
| **Effort control** | `effort: 1-5` in agent/skill frontmatter | Reasoning depth control |
| **ToolSearch** | Deferred tool loading, auto >10% context | Context optimization |
| **Hook features** | `async`, `asyncRewake`, `once`, `if`, `statusMessage` | Cursor/OpenCode lack these |
| **Fork Subagent** | Inherits full parent context + prompt cache optimization | Different from isolated subagent |
| **Dangerous Patterns** | `dangerousPatterns.ts` strips dangerous permission allow-rules (interpreters/shells) at auto-mode entry; `yoloClassifier.ts` detects dangerous commands (`rm -rf`, `git reset --hard`, etc.) | Built-in safety layer |

---

## 12. Skill System — Deep Dive

### Frontmatter Parsing Engine

`utils/frontmatterParser.ts:10-59` — `FrontmatterData` type.

**Parsing:** regex `/^---\s*\n([\s\S]*?)---\s*\n?/` (line 130). Retry logic: if YAML fails, `quoteProblematicValues()` (lines 85-121) wraps globs like `**/*.{ts,tsx}` in quotes, retries.

**All recognized fields:**

| Field | Type | Purpose |
|:---|:---|:---|
| `name` | string | Display name override |
| `description` | string | Model matching hint |
| `argument-hint` | string | Hint for command arguments |
| `when_to_use` | string | Detailed usage scenarios (appended to description in listing) |
| `allowed-tools` | string/string[] | Permission rule syntax, e.g. `Bash(deno:*)` |
| `model` | string | `sonnet`/`opus`/`haiku`/`inherit` |
| `effort` | string | `low`/`medium`/`high`/`max` or any integer (`isValidNumericEffort` checks `Number.isInteger()` only, no 1-5 clamp; `effort.ts:198-200`) |
| `context` | `inline`/`fork` | Execution mode (default: `inline`) |
| `agent` | string | Agent type for fork execution |
| `paths` | string/string[] | Glob patterns for conditional activation |
| `hooks` | HooksSettings | Pre/post execution hooks (validated by `HooksSchema()`) |
| `shell` | string | `bash`/`powershell` for `!` blocks |
| `type` | string | `user`/`feedback`/`project`/`reference` |
| `disable-model-invocation` | bool | User-only (command-like) |
| `user-invocable` | string | Whether users can type `/skill-name` |
| `hide-from-slash-command-tool` | string | Hide from SkillTool listing |
| `skills` | string | Preloaded skills (agents only, comma-separated) |
| `version` | string | Version string |

Unknown fields pass through (`[key: string]: unknown`). No strict validation on extras.

### Prompt Construction Pipeline

`skills/loadSkillsDir.ts:344-399` — `getPromptForCommand()`:

```
Step 1: Prepend base directory (if skill has files)
        "Base directory for this skill: ${baseDir}\n\n${markdownContent}"

Step 2: Substitute arguments ($0, $1, $2...)
        Source: utils/argumentSubstitution.ts
        Example: /skillname arg1 arg2 → $0=skillname, $1=arg1, $2=arg2

Step 3: Replace ${CLAUDE_SKILL_DIR} with skill's directory path

Step 4: Replace ${CLAUDE_SESSION_ID} with current session ID

Step 5: Execute shell commands in prompt content
        !`command` — inline execution
        ```! block — multi-line execution
        SKIPPED for MCP skills (security gate at line 377)
```

### Skill Listing Budget

`tools/SkillTool/prompt.ts:70-195` — `formatCommandsWithinBudget()`:

- Budget: **1% of context window** in characters
- Per-skill: `- ${name}: ${description} - ${whenToUse}` (if whenToUse present)
- Cap: `MAX_LISTING_DESC_CHARS = 250` per skill (line 29)
- Bundled skills **never** truncated (lines 92-108)
- Non-bundled proportionally cut to fit budget

### Skill Sources & Priority

`commands.ts:449-469` — `loadAllCommands()`:

```
1. bundledSkills        — registered at startup (skills/bundled/)
2. builtinPluginSkills  — from enabled built-in plugins
3. skillDirCommands     — disk: ~/.claude/skills, ./.claude/skills
4. workflowCommands     — workflow-backed
5. pluginCommands       — plugin commands
6. pluginSkills         — plugin skills
7. COMMANDS()           — built-in commands
```

Note: The sources array contains **7 entries** (not 9 as previously claimed). `dynamicSkills` and `mcpSkills` are merged separately — `mcpSkills` via SkillTool (lines 81-94), `dynamicSkills` deduped at runtime. Evidence: `commands.ts:449-469` array literal.

Deduplication: `skills/loadSkillsDir.ts:728-763` — `realpath()` resolves symlinks, first wins. Order: managed → user → project → additional → legacy.

### Conditional Skills

`skills/loadSkillsDir.ts:771-796`:
- Skills with `paths:` stored in `conditionalSkills` map
- Activated only when matching files touched
- `activateConditionalSkillsForPaths()` uses `ignore` library (gitignore-style)

### Execution Flow: User → Model

```
User types /skillname args
  → parseSlashCommand() extracts name + args
  → SkillTool.validateInput() (tools/SkillTool/SkillTool.ts:354-430)
    → findCommand(normalizedName, commands)
    → check disableModelInvocation flag
    → verify type === 'prompt'
  → checkPermissions() (lines 432-578)
    → check deny/allow rules
    → auto-allow if only safe properties
    → else prompt user
  → SkillTool.call() (lines 580-649)
    → if context === 'fork': executeForkedSkill() (lines 122-289)
    → else: processPromptSlashCommand() (inline)
```

### Fork Execution Details

`tools/SkillTool/SkillTool.ts:122-289` — `executeForkedSkill()`:

1. Create fresh `agentId` via `createAgentId()`
2. Select agent: `command.agent ?? 'general-purpose'`
3. Merge effort from skill into agent definition
4. Build prompt messages with skill content
5. Call `runAgent()` with isolated state (separate messages, readFileState)
6. Parent sees only result in `<local-command-stdout>` tags

### Bundled Skill Files

`skills/bundledSkills.ts:29-72`:

```typescript
files?: Record<string, string>  // Key: relative path, Value: content
```

- Extracted lazily on first invocation to `getBundledSkillExtractDir(skillName)`
- Security: `safeWriteFile()` with `O_EXCL | O_NOFOLLOW` (TOCTOU protection)
- Path validation: rejects absolute paths and `..` traversal
- Modes: dirs 0o700, files 0o600

### Skill-Level Hooks

`skills/loadSkillsDir.ts:136-153`:
- Validated by `HooksSchema().safeParse()`
- Invalid hooks silently dropped (logged)
- Apply ONLY when that skill is invoked (vs global hooks in settings.json)
- Hook env: `CLAUDE_PLUGIN_ROOT` set to `skillRoot`

---

## 13. Agent System — Deep Dive

### Agent Tool Input Schema

`tools/AgentTool/AgentTool.tsx:82-125` — Zod:

```typescript
{
  description: string             // "3-5 word task description"
  prompt: string                  // Task for agent
  subagent_type?: string          // Agent type (omit for fork mode)
  model?: 'sonnet'|'opus'|'haiku' // Model override
  run_in_background?: boolean     // Async execution
  name?: string                   // Addressable name (for SendMessage)
  mode?: PermissionMode           // Permission override
  isolation?: 'worktree'|'remote' // Isolation mode
  cwd?: string                    // CWD override (KAIROS feature only)
  team_name?: string              // Multi-agent team context
}
```

Dynamic gating: `run_in_background` omitted when `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` set; `remote` only in ant builds; `cwd` only with `KAIROS` feature.

### Full Agent Definition

`tools/AgentTool/loadAgentsDir.ts` — `BaseAgentDefinition`:

```typescript
{
  agentType: string                     // Name/identifier
  whenToUse: string                     // Model selection hint
  tools?: string[]                      // Tool allowlist
  disallowedTools?: string[]            // Tool denylist
  skills?: string[]                     // Preloaded slash commands
  mcpServers?: AgentMcpServerSpec[]     // MCP servers
  hooks?: HooksSettings                 // Agent-scoped hooks
  model?: string                        // Model name or 'inherit'
  effort?: EffortValue                  // any integer or 'low'|'medium'|'high'|'max'
  permissionMode?: PermissionMode       // Permission override
  maxTurns?: number                     // Iteration limit
  initialPrompt?: string               // Prepended to first turn
  memory?: 'user'|'project'|'local'    // Persistent memory scope
  isolation?: 'worktree'|'remote'      // Execution isolation
  omitClaudeMd?: boolean               // Skip CLAUDE.md hierarchy
  background?: boolean                 // Always run as background task
  color?: string                       // UI color
}
```

### Custom Agent Frontmatter Parsing

`tools/AgentTool/loadAgentsDir.ts:541-755`:

**Required:** `name` (→ agentType), `description` (→ whenToUse)

**Parsing:**
- `model`: trim, lowercase 'inherit', else keep (line 571-573)
- `effort`: via `parseEffortValue()` (line 625)
- `memory`: validates `['user', 'project', 'local']` (line 598)
- `isolation`: platform-dependent (ant: both; external: worktree only) (line 609-621)
- `permissionMode`: case-sensitive match (line 638-645)
- `maxTurns`: positive integer (line 649-654)
- `tools`/`disallowedTools`: comma-separated or array (line 656-660)
- `skills`: comma-separated or array (line 684)
- `mcpServers`: array of string refs or inline objects (line 695-708)
- `hooks`: validated via `HooksSchema()` (line 711)

**Auto-injected tools:** if `memory` set, Read/Write/Edit automatically added (line 663-674).

**MCP server specs:**
- String reference: `"slack"` → looks up existing config
- Inline object: `{ "my-server": { ...config } }` → agent-specific, cleaned up after

### Built-in Agents Detail

`tools/AgentTool/built-in/`:

| Agent | Type | Model | Tools | Flags |
|:---|:---|:---|:---|:---|
| General Purpose | `general-purpose` | inherit | `['*']` (all) | Default agent |
| Explore | `Explore` | `haiku` (external) / `inherit` (ant) | All except Agent, ExitPlanMode, Edit, Write, NotebookEdit | `omitClaudeMd: true` |
| Plan | `Plan` | `inherit` | Same as Explore | `omitClaudeMd: true` |
| Claude Code Guide | `claude-code-guide` | restricted | restricted | Non-SDK only |
| Verification | verification | gated | gated | `VERIFICATION_AGENT` flag |
| Statusline Setup | `statusline-setup` | — | Read, Edit | Terminal config |

### Agent Prompt Construction

`tools/AgentTool/prompt.ts:66-287`, `runAgent.ts`:

1. `selectedAgent.getSystemPrompt({ toolUseContext })` — for custom agents: closure over markdown body
2. `enhanceSystemPromptWithEnvDetails()` (line 534)
3. If `memory` set: `loadAgentMemoryPrompt()` appends (agentMemory.ts:138-177)
4. CLAUDE.md included unless `omitClaudeMd: true`
5. If `skills` array set: resolved and injected as initial user messages (`isMeta: true`)

**Differences from parent:** tools may be restricted, permission mode overridable, effort configurable, read-only agents omit CLAUDE.md + gitStatus.

### Agent Memory System

`tools/AgentTool/agentMemory.ts`, `agentMemorySnapshot.ts`:

**Storage paths** (dynamic via `getAgentMemoryDir()`, `agentMemory.ts:52-65`):
- `user`: `${getMemoryBaseDir()}/agent-memory/<agentType>/MEMORY.md` (typically `~/.claude/`, but dynamic — not hardcoded)
- `project`: `${cwd}/.claude/agent-memory/<agentType>/MEMORY.md`
- `local`: `${cwd}/.claude/agent-memory-local/<agentType>/` (can redirect to `CLAUDE_CODE_REMOTE_MEMORY_DIR` mount if env var set)

**Lifecycle:**
1. **Load**: `loadAgentMemoryPrompt()` creates dir + returns prompt section
2. **Write**: Agent uses FileWriteTool at runtime
3. **Snapshot**: `.claude/agent-memory-snapshots/<agentType>/snapshot.json` (`updatedAt` timestamp)
4. **Sync**: `.snapshot-synced.json` tracks last synced time
5. **Actions**: `'none'` / `'initialize'` / `'prompt-update'`

### Agent Worktree Isolation

`tools/AgentTool/AgentTool.tsx:582-685`:

1. **Create**: `createAgentWorktree(slug)` → `{ worktreePath, worktreeBranch, headCommit, gitRoot }`
2. **Notice**: `buildWorktreeNotice()` — tells agent to re-read files, translate paths
3. **CWD**: `runWithCwdOverride(worktreePath, fn)` (line 641)
4. **Cleanup**: `cleanupWorktreeIfNeeded()`:
   - No changes → removed + metadata cleared
   - Changes present → kept with path in metadata
   - Hook-based worktrees always kept
5. **Resume**: Checks existence, bumps mtime (resumeAgent.ts:82-97)

### Agent Skills Preloading

`runAgent.ts:577-646`:

1. `skillsToPreload = agentDefinition.skills ?? []`
2. Resolve via `resolveSkillName()` (exact, plugin-prefixed, suffix match)
3. Fetch content: `skill.getPromptForCommand()`
4. Inject as `user` message with `isMeta: true` before first prompt

### Agent Permission Bubbling

`runAgent.ts:415-463`:

- `permissionMode: 'bubble'` → `shouldAvoidPrompts = false` (line 443)
- Prompts surface to parent terminal even in async agents
- Override chain: agent → parent (bypass/acceptEdits/auto win)

### Fork Subagent

`tools/AgentTool/forkSubagent.ts`:

- Triggered when `subagent_type` omitted
- Inherits full parent context (assistant message + tool_uses)
- `FORK_PLACEHOLDER_RESULT` — byte-identical across children for prompt cache
- Recursive prevention: `FORK_BOILERPLATE_TAG`
- Permission: `'bubble'`, maxTurns: 200

### Agent Communication (SendMessage)

`tools/SendMessageTool/SendMessageTool.ts`:

```typescript
{ to: string, summary?: string, message: string | StructuredMessage }
```

Targets: teammate name, `"*"` (broadcast), `"uds:<socket>"`, `"bridge:<session-id>"`.
Structured types: `shutdown_request`, `shutdown_response`, `plan_approval_response`.

---

## 14. Hook System — Deep Dive

### Execution Engine

`utils/hooks.ts:1952` — `executeHooks()` async generator:

```typescript
async function* executeHooks({
  hookInput, toolUseID, matchQuery, signal,
  timeoutMs = TOOL_HOOK_EXECUTION_TIMEOUT_MS,  // 10 min
  toolUseContext, messages, forceSyncExecution,
  requestPrompt, toolInputSummary,
}): AsyncGenerator<AggregatedHookResult>
```

**Per-type execution** (note: prompt/agent/http implementations are in separate imported modules, not inline):
- **Command** (line 747: `execCommandHook()` definition; execution at ~2448+): shell spawn
- **Prompt** (imported from `hooks/execPromptHook.js` at line 148; called at line 2230): LLM evaluation
- **Agent** (imported from `hooks/execAgentHook.js` at line 150; called at line 2267): agentic verification
- **HTTP** (imported from `hooks/execHttpHook.js` at line 151; called at line 2302): POST JSON
- **Function** (line 4740: `executeFunctionHook()`): Direct JS callback, no subprocess

### Matching

`utils/hooks.ts:1603` — `getMatchingHooks()` (lines 1616-1670):

| Event | Matcher Field |
|:---|:---|
| PreToolUse/PostToolUse/PostToolUseFailure/PermissionRequest/PermissionDenied | `tool_name` |
| SessionStart/ConfigChange | `source` (startup/resume/clear/compact) |
| Setup/PreCompact/PostCompact | `trigger` (init/maintenance) |
| Notification | `notification_type` |
| SessionEnd | `reason` |
| StopFailure | `error` |
| SubagentStart/SubagentStop | `agent_type` |
| Elicitation/ElicitationResult | `mcp_server_name` |
| InstructionsLoaded | `load_reason` |
| FileChanged | basename of `file_path` |
| TeammateIdle/TaskCreated/TaskCompleted | No matchQuery (all hooks apply) |

Pattern matching: `matchesPattern()` (lines 1681-1686) with glob-style wildcards.

### `if` Condition Engine

`utils/hooks.ts:1390-1421`:

1. Only for tool events (PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest)
2. Parses via `permissionRuleValueFromString()` — same syntax as permission rules
3. Compares tool name via `normalizeLegacyToolName()`
4. Delegates to tool's `preparePermissionMatcher()` for pattern matching

Examples: `"Bash(git *)"`, `"Write(*.ts)"`, `"Read"` (all Read calls)

### Input Contract

`utils/hooks.ts:301-328` — `createBaseHookInput()`:

```typescript
// Base (all events)
{
  session_id: string,
  transcript_path: string,     // absolute path to JSONL transcript
  cwd: string,
  permission_mode?: string,
  agent_id?: string,
  agent_type?: string,
}

// PreToolUse additions (lines 3418-3424)
+ hook_event_name: 'PreToolUse'
+ tool_name: string
+ tool_input: Record<string, unknown>
+ tool_use_id: string

// PostToolUse additions (lines 3450-3477)
+ hook_event_name: 'PostToolUse'
+ tool_name: string
+ tool_input: ToolInput
+ tool_response: ToolResponse      // actual tool output
+ tool_use_id: string

// SessionStart additions
+ hook_event_name: 'SessionStart'
+ source: 'startup' | 'resume' | 'clear' | 'compact'
+ agent_type?: string
+ model?: string

// UserPromptSubmit additions
+ hook_event_name: 'UserPromptSubmit'
+ prompt: string                   // user's message text
```

### Output Contract

`types/hooks.ts:49-166`:

```typescript
{
  // Universal
  continue?: boolean,              // default true
  suppressOutput?: boolean,        // hide stdout
  stopReason?: string,             // message when continue=false
  decision?: 'approve' | 'block',
  reason?: string,
  systemMessage?: string,          // user-facing warning

  // Event-specific
  hookSpecificOutput?: {
    hookEventName: string,

    // PreToolUse only
    permissionDecision?: 'allow' | 'deny' | 'ask',
    updatedInput?: Record<string, unknown>,  // MODIFY tool input
    additionalContext?: string,

    // PostToolUse only
    updatedMCPToolOutput?: unknown,          // MCP tools only

    // SessionStart only
    additionalContext?: string,
    initialUserMessage?: string,             // prepend to session
    watchPaths?: string[],                   // register FileChanged watchers
  }
}
```

### Exit Code Semantics

`utils/hooks.ts:2647-2648` (NOT `hookHelpers.ts` — that file contains utility functions for hook responses, not exit code logic):

| Exit Code | Behavior |
|:---|:---|
| **0** | Success: stdout shown to Claude |
| **2** | Blocking: stderr to model, prevents tool execution |
| **Other** | Non-blocking error: stderr to user only, continues |

### PreToolUse Capabilities

`utils/hooks.ts:3404-3436`:
- **Modify tool input**: return `hookSpecificOutput.updatedInput` → merged before execution
- **Block execution**: exit code 2, or `decision: 'block'` → tool doesn't run
- **Permission decision**: `permissionDecision: 'allow'|'deny'|'ask'`

### PostToolUse Capabilities

`utils/hooks.ts:3450-3477`:
- Receives `tool_response` in input
- Can modify MCP output via `updatedMCPToolOutput` (MCP tools only)
- Observational — cannot block retroactively

### UserPromptSubmit Capabilities

`utils/hooks.ts:3826-3855`:
- **Cannot modify prompt** (no `updatedInput` support)
- **Can block submission**: exit code 2 prevents processing, erases prompt
- `additionalContext` shown to Claude

### SessionStart/End Capabilities

**SessionStart** (lines 3867-3891):
- `additionalContext` — shown to Claude
- `initialUserMessage` — prepends message to session
- `watchPaths` — registers FileChanged watchers

**SessionEnd** (lines 4113-4160):
- Timeout: 1500ms default, via `CLAUDE_SESSION_END_HOOK_TIMEOUT_MS` env var
- Input: `{ reason: 'clear'|'logout'|'prompt_input_exit'|'other' }`

### Timeouts

| Context | Default | Override |
|:---|:---|:---|
| Tool hooks (Pre/Post) | 10 min (600,000 ms) | Per-hook `timeout` (seconds) |
| HTTP hooks | 10 min | Per-hook `timeout` |
| Prompt hooks | 10 min | Per-hook `timeout` (NOT 30 sec — uses same `TOOL_HOOK_EXECUTION_TIMEOUT_MS`; evidence: `hooks.ts:3851`) |
| Session End | 1500 ms | `CLAUDE_SESSION_END_HOOK_TIMEOUT_MS` env (evidence: `hooks.ts:175`) |

On timeout: AbortController fires, process killed, returns `aborted: true`.

### Async Execution

**`async: true`** — fire-and-forget:
- Returns immediately with empty output, outcome always 'success'

**`asyncRewake: true`** — background with error wake:
- Exit code 2 → enqueues `task-notification` to wake model
- Exit code 0 → silent

### Hook Environment Variables

`utils/hooks.ts:882-927`:
- `CLAUDE_PROJECT_DIR` — stable project root
- `CLAUDE_PLUGIN_ROOT` — plugin root directory
- `CLAUDE_PLUGIN_DATA` — plugin data directory
- `CLAUDE_PLUGIN_OPTION_*` — plugin user config options

SessionStart/Setup/CwdChanged/FileChanged also get:
- `CLAUDE_ENV_FILE` — path to .sh file; hook writes exports, sourced into subsequent Bash calls

HTTP hooks: header values support `$VAR_NAME` / `${VAR_NAME}`, only `allowedEnvVars` interpolated.

### settings.json Hook Format

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/pre-bash.sh",
            "if": "Bash(git *)",
            "timeout": 30,
            "statusMessage": "Validating git command..."
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          { "type": "command", "command": "deno task sync-local" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "http",
            "url": "https://api.example.com/audit",
            "headers": { "Authorization": "Bearer $TOKEN" },
            "allowedEnvVars": ["TOKEN"]
          }
        ]
      }
    ]
  }
}
```

### Hook Deduplication

`utils/hooks.ts:1453-1454` + `1748-1794`:
- Base key function at line 1453: `hookDedupKey(m, payload)` → `${m.pluginRoot ?? m.skillRoot ?? ''}\0${payload}`
- Per-type payload (lines 1748-1794):
  - Command: `shell\0command\0if-condition`
  - Prompt/Agent: `prompt\0if-condition`
  - HTTP: `url\0if-condition`
- Last-merged scope wins for settings hooks
- Callback/function hooks skip dedup

---

## 15. Settings & Configuration — Deep Dive

### Settings Sources Priority

`utils/settings/settings.ts:319-407`:

**Policy (first wins):**
1. Remote managed settings (sync cache)
2. MDM admin-only (HKLM / plist)
3. File-based managed (`/etc/claude-code/managed-settings.json` + drop-ins)
4. HKCU (user-writable registry, Windows only)

**Per-source (merged):**
Policy → Project → User → Local

**File paths:**
- Policy: `${getManagedFilePath()}/managed-settings.json`
- Drop-ins: `${getManagedSettingsDropInDir()}/*.json` (sorted alphabetically)
- User: `~/.claude/settings.json`
- Project: `.claude/settings.json`
- Local: `.claude/settings.local.json`

Merge: arrays concatenate + deduplicate (`settingsMergeCustomizer`, lines 538-547).

### Settings Schema (Key Sections)

`utils/settings/types.ts`:

```typescript
{
  // Permissions
  permissions?: {
    allow?: PermissionRule[],
    deny?: PermissionRule[],
    ask?: PermissionRule[],
    defaultMode?: PermissionMode,
    disableBypassPermissionsMode?: 'disable',
    disableAutoMode?: 'disable',
    additionalDirectories?: string[]
  },

  // Hooks
  hooks?: HooksSchema,

  // MCP
  enableAllProjectMcpServers?: boolean,
  enabledMcpjsonServers?: string[],
  disabledMcpjsonServers?: string[],
  allowedMcpServers?: AllowedMcpServerEntry[],
  deniedMcpServers?: DeniedMcpServerEntry[],

  // Environment
  env?: Record<string, string>,

  // Plugin configs
  pluginConfigs?: {
    [pluginId]: {
      mcpServers?: { [server]: Record<string, string|number|boolean|string[]> }
    }
  },

  // Enterprise locks
  strictPluginOnlyCustomization?: boolean | string[],
  allowManagedHooksOnly?: boolean,
  allowManagedPermissionRulesOnly?: boolean,
  allowManagedMcpServersOnly?: boolean,
  allowedHttpHookUrls?: string[],
  httpHookAllowedEnvVars?: string[]
}
```

### Permission Rules Syntax

`utils/settings/permissionValidation.ts:58-239`:

```
Format: ToolName(pattern)  |  ToolName  |  mcp__server__tool

Valid:
  Bash(npm run:*)         — prefix matching (legacy :*)
  Bash(npm *)             — wildcard
  Bash(npm * --save)      — wildcard at any position
  FileRead(src/**)        — glob
  FileRead(*.test.ts)     — extension matching
  mcp__server             — MCP server-level (all tools)
  mcp__server__*          — MCP wildcard
  mcp__server__tool       — specific MCP tool

Invalid:
  Tool()                  — empty parens
  mcp__server(*)          — MCP can't have patterns
  FileRead(:*)            — :* is bash-only
```

### CLAUDE.md Discovery

`utils/claudemd.ts`:

**Loading order:**
1. Managed: `/etc/claude-code/CLAUDE.md`
2. User: `~/.claude/CLAUDE.md`
3. Project (walk CWD upward): `CLAUDE.md`, `.claude/CLAUDE.md`, `.claude/rules/*.md`
4. Local: `CLAUDE.local.md` (gitignored)

**@include directive** (lines 451-535): regex `/(?:^|\s)@((?:[^\s\\]|\\ )+)/g`
- Supports: `@path`, `@./relative`, `@~/home`, `@/absolute`
- Leaf text only (skips code blocks)
- MAX_INCLUDE_DEPTH = 5
- Non-existent files silently ignored

**Limits:**

| Limit | Value | Location |
|:---|:---|:---|
| Max per file | 40,000 chars | `claudemd.ts:92` |
| @include depth | 5 levels | `claudemd.ts:537` |
| Conditional rule lines | 200 per file | `attachments.ts:269` |
| Conditional rule bytes | 4,096 per file | `attachments.ts:277` |
| Rules per turn | ~5 files | `attachments.ts:271` |

**System-reminder wrapping:** `utils/messages.ts:3097-3098` — `wrapInSystemReminder(content)`.

### Feature Flags

Compile-time via `bun:bundle`:
```typescript
if (feature('FEATURE_NAME')) { /* dead-code eliminated when off */ }
```

Major flags: `PROACTIVE`/`KAIROS` (autonomous), `COORDINATOR_MODE`, `TRANSCRIPT_CLASSIFIER` (auto permissions), `TEAMMATE_MODE`, `VERIFICATION_AGENT`, `FORK_SUBAGENT`, `REPL_MODE`, `EXPERIMENTAL_SKILL_SEARCH`.

### MDM Policy Override

`utils/settings/mdm/settings.ts`:

| Platform | Source | Access |
|:---|:---|:---|
| macOS | `/Library/Managed Preferences/com.anthropic.claudecode` | root |
| Windows HKLM | `HKLM\SOFTWARE\Policies\ClaudeCode` | admin |
| Windows HKCU | `HKCU\SOFTWARE\Policies\ClaudeCode` | user |
| Linux | `/etc/claude-code/managed-settings.json` | root |

---

## 16. Tool System — Deep Dive

### Tool Interface

`Tool.ts`:

```typescript
{
  name: string,
  aliases?: string[],
  searchHint?: string,           // ToolSearch keyword matching
  shouldDefer?: boolean,         // lazy-load via ToolSearch
  alwaysLoad?: boolean,          // always in context (never deferred)
  maxResultSizeChars: number,
  strict?: boolean,              // strict JSON Schema enforcement

  // Methods
  call(args, context, canUseTool, parentMessage, onProgress),
  description(input, options): string,
  inputSchema: Zod,
  isConcurrencySafe(input): boolean,
  isEnabled(): boolean,
  isReadOnly(input): boolean,
  isDestructive?(input): boolean,
  checkPermissions(input, context): Promise<PermissionResult>,  // actual name, NOT "requiresPermission" (Tool.ts:500-503)
  validateInput?(input, context),
  interruptBehavior?(): 'cancel' | 'block',
  isSearchOrReadCommand?(input): boolean,
  backfillObservableInput?(input),
}
```

### All Built-in Tools

`tools.ts:193-251` — `getAllBaseTools()`:

**Always present (19 core):** AgentTool, TaskOutputTool, BashTool, FileReadTool, FileEditTool, FileWriteTool, NotebookEditTool, WebFetchTool, TodoWriteTool, WebSearchTool, TaskStopTool, AskUserQuestionTool, SkillTool, EnterPlanModeTool, ExitPlanModeV2Tool, SendMessageTool (line 226, unconditional `getSendMessageTool()`), BriefTool, ListMcpResourcesTool, ReadMcpResourceTool

**Conditional (30+, feature-gated):** GlobTool, GrepTool, ConfigTool, TungstenTool, WebBrowserTool, TaskCreate/Get/Update/ListTool, LSPTool, EnterWorktreeTool, ExitWorktreeTool, SendMessageTool, ListPeersTool, TeamCreate/DeleteTool, VerifyPlanExecutionTool, REPLTool, WorkflowTool, SleepTool, CronCreate/Delete/ListTool, RemoteTriggerTool, MonitorTool, SendUserFileTool, PushNotificationTool, SubscribePRTool, PowerShellTool, SnipTool, ToolSearchTool, OverflowTestTool, CtxInspectTool, TerminalCaptureTool

Note: Category groupings (Core, Navigation, etc.) are editorial — no such categories exist in source code.

### Deferred Tools (ToolSearch)

`shouldDefer: true` → schema not in system prompt. Model requests via `ToolSearch` tool on demand. Saves ~10% context.

### MCP Tool Naming

Prefixed: `mcp__<server>__<tool>` (or unprefixed in `NO_PREFIX` mode).

---

## 17. Plugin Architecture — Deep Dive

### Plugin Manifest

`types/plugin.ts`:

```typescript
{
  name: string, version: string, description: string,
  author?: string, homepage?: string,
  skills?: Skill[], agents?: Agent[], tools?: Tool[],
  hooks?: HookDefinition[], mcpServers?: McpServerDefinition[],
  settings?: Record<string, unknown>
}
```

### Plugin Sources

- `~/.claude/plugins/` (user)
- `.claude/plugins/` (project)
- Marketplace (managed)
- Policy-managed / policy-denied

### Plugin Skill Namespacing

Skills from plugins: `/plugin-name:skill-name` in system prompt listing.


---

