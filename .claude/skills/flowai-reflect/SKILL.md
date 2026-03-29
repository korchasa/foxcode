---
name: flowai-reflect
description: Analyze agent's process, logic, technical decisions, context usage, and undocumented discoveries to find behavioral errors, poor engineering choices, inefficiencies, and missing knowledge in project instructions.
disable-model-invocation: true
---

# Task: Reflect on Process, Technical Decisions, Context & Knowledge Gaps

## Overview

Analyze the task execution (either current history or a provided transcript) to identify errors in the **agent's process and logic**, weaknesses in **technical decisions**, inefficiencies in **context usage**, and **useful discoveries not captured in project instructions**.
Focus on *how* the agent attempted to solve the problem, *whether the chosen technical approach was sound*, *what information it used or missed*, and *what new knowledge was gained but not persisted*.

## Context

<context>
The goal is to perform a "Root Cause Analysis" of the agent's behavior, evaluate the quality of its technical decisions, audit its information gathering, AND identify useful knowledge discovered during work that is missing from project instructions.

### Behavioral Errors
- **Logic Loops**: Repeating the same failing action.
- **False Assumptions**: Assuming a state without verifying.
- **Ignoring Feedback**: Ignoring tool error messages.
- **Process Violations**: Skipping required steps (like reading docs or verifying).
- **Hallucinations**: Inventing facts or file contents.

### Technical Decision Errors
- **Overcomplexity**: Solution more complex than necessary (extra abstractions, unnecessary indirection, premature generalization).
- **Wrong Abstraction Level**: Solving at the wrong layer (e.g., app-level fix for an infra problem, or vice versa).
- **Ignoring Existing Patterns**: Not following established project conventions, reinventing what already exists in the codebase.
- **Poor Error Handling**: Missing error paths, swallowing exceptions, unclear failure modes.
- **Fragile Design**: Solution tightly coupled, hard to test, or brittle to future changes.
- **Performance Anti-patterns**: O(n^2) where O(n) is trivial, unnecessary I/O, missing caching for repeated operations.
- **Security Gaps**: Unsanitized input, hardcoded secrets, excessive permissions.
- **Wrong Tool/Library Choice**: Using a dependency where stdlib suffices, or picking a deprecated/unmaintained library.
- **Unrequested Fallbacks**: Adding fallback/default behavior the user never asked for (e.g., silent retries, default values masking errors, graceful degradation where fail-fast was expected).

### Context Inefficiencies
- **Missing Context**: Information the agent needed but never obtained.
- **Redundant Context**: Information the agent loaded but never used.

### Automation Opportunities
Repeating manual actions that could be codified:
- **Manual Multi-Step Workflows**: Sequence of actions performed manually that recurs across tasks (candidate for a skill or command).
- **Ad-hoc Decisions**: Choices made without a documented rule, leading to inconsistency (candidate for a rule).
- **Unchecked Invariants**: Conditions verified manually that a hook or CI step could enforce automatically (candidate for a hook).

### Target Artifact Taxonomy
When proposing a fix, classify *where* it belongs:
- **Project Docs** (AGENTS.md, README, SRS, SDS) - persistent project-wide context, conventions, stack info.
- **Rule** (glob-triggered IDE rule) - formatting, style, or behavioral constraint scoped to specific files.
- **Skill** (multi-step workflow) - repeatable procedure the agent can follow.
- **Command** (one-shot action) - single-purpose shortcut wrapping multiple steps.
- **Hook** (automated check) - deterministic validation triggered by file save or pre-commit.
- **Code Comment** - inline explanation of non-obvious logic in source code.

### Undocumented Discoveries
**Universally useful** knowledge gained during task execution that exists only in the conversation and is not persisted in project docs/rules/instructions. Only facts relevant to most future tasks qualify - discard one-off or task-specific details:
- **Implicit Conventions**: Patterns, naming rules, or constraints discovered empirically (e.g., "API returns 429 after 10 req/s", "field X must be set before Y").
- **Environment Quirks**: Non-obvious tooling behavior, version-specific bugs, platform differences found by trial and error.
- **Architectural Insights**: Discovered dependencies, data flows, or coupling between components not documented anywhere.
- **Workarounds & Gotchas**: Solutions to problems that required non-obvious steps (e.g., "must restart service after config change", "header X is required but undocumented").
- **Domain Knowledge**: Business rules, edge cases, or valid/invalid states clarified during the session.
</context>

## Rules & Constraints

<rules>
1. **Evidence-Based**: Base all observations on the actual conversation history, tool outputs, AND session history (if available).
2. **Specific References**: When suggesting improvements, cite the specific file (e.g., a rules or commands file in the project's IDE configuration directory) or the command name.
3. **Constructive**: Focus on actionable improvements (additions, clarifications, removals).
4. **Do not make changes to the agent's instructions or rules**. Only suggest improvements.
5. **Mandatory**: The agent MUST use a task management tool (e.g., `todo_write`, `todowrite`, `Task`) to track the execution steps.
6. **Pattern Validation**: Before proposing a fix for an issue found in the current session, check session history to determine whether it is a **recurring pattern** or an **isolated incident**. Prioritize systemic fixes for recurring patterns over one-off corrections.
</rules>

## Instructions

<step_by_step>
1. **Initialize**
   - Use a task management tool (e.g., `todo_write`, `todowrite`) to create a plan for the reflection process.

2. **Identify Source**
   - If the user points to a transcript file, read it using available file reading tools.
   - Otherwise, review the current conversation history.

3. **Load Session History**
   - Look for session history files (e.g., `session-history/` directory, previous transcripts, or logs).
   - If session history exists, read all available session transcripts.
   - Build a summary of recurring issues: for each error type, note how many sessions it appeared in, the pattern signature, and whether the root cause was the same.
   - This data will be used in later steps to distinguish recurring patterns from isolated incidents.

4. **Analyze Execution Flow**
   - Map out the agent's "Thought -> Action -> Result" loop.
   - Identify where the chain broke:
     - Did the Thought match the Goal?
     - Did the Action match the Thought?
     - Did the Agent interpret the Result correctly?

5. **Detect Logic Patterns**
   - **Looping**: Is the agent retrying without changing strategy?
   - **Blindness**: Is the agent ignoring "File not found" or linter errors?
   - **Stubbornness**: Is the agent forcing a solution that doesn't fit?

6. **Evaluate Technical Decisions**
   Review the actual code/changes produced by the agent:
   - **Complexity Check**: Is the solution proportional to the problem? Could it be simpler?
   - **Pattern Conformance**: Does it follow existing project patterns (naming, structure, error handling)? Or does it introduce inconsistencies?
   - **Abstraction Fit**: Is the problem solved at the right layer? Is there unnecessary indirection or missing encapsulation?
   - **Error Handling**: Are failure modes explicit and handled? Are errors swallowed or masked?
   - **Robustness**: Is the solution fragile to edge cases, concurrency, or future changes?
   - **Performance**: Are there obvious inefficiencies (quadratic loops, redundant I/O, missing caching)?
   - **Security**: Is input validated? Are secrets/permissions handled correctly?
   - **Dependency Choice**: Are dependencies justified? Could stdlib or existing project code suffice?
   - **Unrequested Fallbacks**: Did the agent add fallback/default behavior not asked for (silent retries, default values masking errors, graceful degradation where fail-fast was expected)?

7. **Analyze Context: Missing Information**
   Identify what the agent *should have* read/checked but didn't:
   - **Unread docs**: Project docs (README, AGENTS.md, design docs) relevant to the task but never opened.
   - **Unread source**: Related source files (imports, callers, interfaces) that would have prevented errors.
   - **Unused skills/rules**: Available skills or rules that were relevant but not consulted.
   - **Skipped verification**: Test results, linter output, or runtime checks that would have caught issues earlier.
   - **Unasked questions**: Ambiguities the agent resolved by guessing instead of asking the user.

8. **Analyze Context: Redundant Information**
   Identify what the agent loaded but *didn't need*:
   - **Read-but-unused files**: Files opened via file reading tools but never referenced in the solution.
   - **Over-reading**: Large files read entirely when only a small fragment (function, config key) was needed.
   - **Repeated reads**: The same unchanged file read multiple times, wasting context window.
   - **Irrelevant tool output**: Command outputs (e.g., verbose logs, full `git diff`) that added noise without value.
   - **Off-task files**: Files from unrelated domains or previous tasks still in context.

9. **Extract Undocumented Discoveries**
   Scan the session for useful knowledge that was learned but not persisted:
   - Review tool outputs, error messages, and user clarifications for **facts not present in any project file**.
   - For each discovery, check whether it is already documented in project docs (AGENTS.md, README, SRS, SDS, rules, code comments).
   - A discovery qualifies if ALL three conditions are met:
     (a) it was essential to solving the task or avoiding an error,
     (b) a future agent starting a new session would not have access to it,
     (c) it is **universally useful** - applicable to most future tasks in this project, not just the current one.
   - **Discard** task-specific, one-off, or narrow facts that won't help in other contexts (e.g., "file X had a typo on line 42", "user prefers blue buttons").
   - **Keep** knowledge that affects how the project is built, run, tested, or deployed in general (e.g., "API requires header X for all endpoints", "tests must run sequentially due to shared DB state", "config changes require service restart").

10. **Identify Automation Opportunities**
   Scan the session for repeating manual work that could be codified:
   - **Repeated workflows**: Was a multi-step sequence performed manually that is likely to recur? -> suggest a skill or command.
   - **Ad-hoc decisions**: Were formatting, naming, or structural choices made without a documented rule? -> suggest a rule.
   - **Manual checks**: Were invariants verified by the agent manually (e.g., "check that file has frontmatter") that a hook could enforce? -> suggest a hook.
   - Only include items that would save effort across multiple future tasks.

11. **Cross-Session Pattern Analysis**
   If session history was loaded in step 3:
   - For each issue found in steps 4-10, check if a **similar issue** appeared in previous sessions.
   - Classify each issue as:
     - **Recurring** (appeared in 2+ sessions with similar root cause) - requires a systemic fix (rule, hook, skill, or architectural change).
     - **Isolated** (appeared only in the current session) - may be a one-off; propose a targeted fix but note the lower priority.
   - For recurring patterns, include: frequency (N sessions out of M total), pattern signature, and why it keeps happening.
   - Recurring patterns MUST be prioritized above isolated issues in the report.

12. **Formulate Report**
   - **Process Summary**: What went wrong in the *process*?
   - **Technical Summary**: What was wrong with the *technical approach*?
   - **Root Cause**: Why did the agent make this mistake? (e.g., "Assumed file existed", "Didn't check existing patterns").
   - **Cross-Session Patterns**: Which issues are recurring across sessions? Include frequency and evidence from multiple sessions.
   - **Context Gaps**: What missing information led to errors or wasted effort?
   - **Context Waste**: What unnecessary information consumed context budget?
   - **Undocumented Discoveries**: What useful knowledge was gained but not captured in project files?
   - **Automation Opportunities**: What manual work could be codified as a skill, rule, or hook?
   - **Corrective Actions**: What should the agent do differently? Format as two-level list with artifact type and evidence:

   1. **[Process] Retried 3x without strategy change**
      - Artifact: Rule (AGENTS.md)
      - Fix: Add backoff rule
      - Evidence: steps 5-7 in transcript - same `sed` command repeated
   2. **[Technical] Ignored existing error handling pattern**
      - Artifact: -
      - Fix: Check similar code before implementing
      - Evidence: agent wrote try/catch while project uses Result type
   3. **[Missing] Never read AGENTS.md before starting**
      - Artifact: Rule (AGENTS.md)
      - Fix: Add "read project docs first" rule
      - Evidence: agent guessed project stack, got it wrong
   4. **[Redundant] Read entire 2000-line log file**
      - Artifact: -
      - Fix: Use grep/search instead of full read
      - Evidence: only line 1842 was relevant
   5. **[Discovery] API returns 429 after 10 req/s - not documented**
      - Artifact: Project Docs (docs/api.md)
      - Fix: Add rate limit info
      - Evidence: agent hit 429 twice before adjusting request rate
   6. **[Automation] Manual frontmatter validation on every .md edit**
      - Artifact: Hook (pre-commit)
      - Fix: Add frontmatter schema check
      - Evidence: agent manually verified frontmatter 3 times in session
   7. **[Recurring] Stale mocks cause TypeError in test fixes (3/3 sessions)**
      - Artifact: Rule (AGENTS.md) + Skill (mock refresh)
      - Fix: Add rule "always regenerate mocks from current interfaces before fixing tests"; create a skill for automated mock refresh
      - Evidence: sessions 2025-12-01, 2025-12-15, 2026-01-10 - same pattern of trial-and-error mock editing
      - Priority: HIGH (systemic, not isolated)

13. **Report Findings**
   - Present the report from step 12.
   - List the proposed actionable items.
   - Ask the user if they want to apply these changes immediately.
</step_by_step>
