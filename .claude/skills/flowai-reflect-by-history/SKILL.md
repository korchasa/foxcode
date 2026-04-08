---
name: flowai-reflect-by-history
description: Analyze previous IDE session history to find recurring patterns in agent behavior, identify systemic issues, and propose improvements to project primitives (rules, skills, hooks). Use when the user asks to review past sessions, find recurring problems, or improve development workflow based on historical data.
disable-model-invocation: true
---

# Task: Reflect on Previous Session History

Analyze **previous** IDE session transcripts (not the current session) to identify recurring behavioral patterns, systemic issues, and propose improvements to project primitives (rules, skills, hooks, project docs).

Unlike `flowai-reflect` (which analyzes the current session), this skill works with historical data across multiple past sessions to find cross-session patterns.

## Session History Locations

### Claude Code

Session history is stored as JSONL files:

- **Project-local**: `.claude/projects/` relative to project root (if present)
- **User-level**: `~/.claude/projects/{project-path-with-dashes}/` — each `.jsonl` file is one session
- **Global index**: `~/.claude/history.jsonl` (prompt text, timestamp, project path, session ID per line)

JSONL format — each line is a JSON object with `type` field:
- `type: "user"` — user messages (`message.content` has the text)
- `type: "assistant"` — agent responses (may contain `tool_use` in `message.content[]`)
- `type: "progress"` — hook/tool progress events
- `type: "ai-title"` — session title (`aiTitle` field)
- `type: "queue-operation"` — internal queue events (skip)
- `type: "file-history-snapshot"` — file backup metadata (skip)

## Discovery Strategy

1. Detect IDE — this project uses Claude Code (check for `.claude/` directory).
2. **Project-local first**: check `.claude/projects/` within the project root. List all subdirectories and `.jsonl` files. If session files are found here, use them.
3. **User-level fallback**: only if no project-local history found, check `~/.claude/projects/`.
4. **Filter out current session**: exclude the JSONL file for the currently running session (it is still being written and is not "previous" history). If only the current session is found, report "No previous session history found" and stop.
5. **No history**: if no session files are found at all, clearly report "No session history found" and suggest where the user can check. Do not fabricate or hallucinate analysis results.
6. List available sessions, sort by date (newest first)

## Scope Determination

Decide how many sessions to analyze based on the user's request:

| User Request | Scope | Sessions |
|---|---|---|
| "Find recurring issues" / "patterns" | Deep | All available or last 10-20 |
| "What went wrong recently?" | Recent | Last 3-5 sessions |
| "Review last session" | Single | Last 1 |
| "How has X improved?" | Trend | All sessions mentioning X |
| Unspecified | Default | Last 5-10 sessions |

If more than 20 sessions available, analyze the most recent 10-20 unless user specifies otherwise. Explain the scope chosen and why.

## Analysis Focus

For each session, extract:

1. **Task summary** — what was requested (from `ai-title` and first user message)
2. **Tool usage** — which tools were called, how many times, in what order
3. **Errors & retries** — failed tool calls, repeated attempts, error messages
4. **Primitive usage** — which skills/commands were invoked, which rules were triggered
5. **Time patterns** — session duration (calculated from first/last message timestamps), idle gaps, bursts of activity

### Cross-Session Pattern Detection

Compare across sessions to find:

- **Recurring errors** — same error type or message appearing in 2+ sessions
- **Repeated manual workflows** — same sequence of actions performed manually across sessions (candidate for a skill or command)
- **Ad-hoc decisions** — choices made inconsistently without a rule (candidate for a rule)
- **Unchecked invariants** — conditions verified manually that could be automated (candidate for a hook)
- **Underused primitives** — available skills/commands that could have been used but weren't
- **Missing knowledge** — information discovered in sessions but not captured in project docs

## Target Artifact Taxonomy

When proposing a fix, classify *where* it belongs:

- **Rule** (glob-triggered IDE rule) — formatting, style, or behavioral constraint scoped to specific files
- **Skill** (multi-step workflow) — repeatable procedure the agent can follow
- **Command** (one-shot action) — single-purpose shortcut wrapping multiple steps
- **Hook** (automated check) — deterministic validation triggered by file save or pre-commit
- **Project Docs** (AGENTS.md, CLAUDE.md, README) — persistent project-wide context, conventions
- **Code Change** — fix in the codebase itself (e.g., shared test helper, better abstractions)

## Instructions

1. **Initialize**
   - Add tasks to the todo list for tracking progress.

2. **Locate History**
   - Detect the IDE (Claude Code).
   - Find session history files using the paths from "Session History Locations" above.
   - List and sort sessions by date.

3. **Determine Scope**
   - Based on user request, decide how many sessions to analyze (see "Scope Determination" table).
   - Communicate the chosen scope and reasoning to the user.

4. **Read & Parse Sessions**
   - Read each session JSONL file.
   - For each session, extract: title, user requests, tool calls, errors, outcomes.
   - Skip `queue-operation`, `file-history-snapshot`, and `progress` type entries (unless they contain hook errors).

5. **Analyze Individual Sessions**
   - For each session, identify: behavioral errors, technical decisions, context usage, outcomes.
   - Note any undocumented discoveries or ad-hoc decisions.

6. **Cross-Session Pattern Analysis**
   - Compare findings across sessions.
   - For each issue, classify as:
     - **Recurring** (2+ sessions, similar root cause) → requires systemic fix
     - **Isolated** (1 session only) → note but lower priority
   - For recurring patterns: count frequency, describe pattern signature, explain why it keeps happening.

7. **Formulate Report**
   Present findings in this structure:

   - **Scope**: N sessions analyzed, date range, reasoning for scope choice
   - **Recurring Patterns**: Issues found in 2+ sessions, with frequency and evidence
   - **Isolated Issues**: Notable one-off problems (lower priority)
   - **Primitive Usage Summary**: Which primitives were used/underused across sessions
   - **Corrective Actions**: Proposed fixes, each classified by artifact type with evidence:

   Example format:
   ```
   1. **[Recurring] WebSocket reconnect logic breaks after server restart (3/5 sessions)**
      - Artifact: Code Change + Rule
      - Fix: Add integration test for reconnect flow + rule to verify WS connectivity after server changes
      - Evidence: sessions 2026-03-15, 2026-03-20, 2026-03-28 — same ECONNREFUSED pattern
      - Priority: HIGH (systemic)

   2. **[Isolated] Forgot to check existing middleware patterns**
      - Artifact: —
      - Fix: One-off, no systemic action needed
      - Evidence: session 2026-03-25 only
   ```

8. **Present & Confirm**
   - Present the report.
   - Ask the user if they want to apply any of the proposed changes.
