---
name: flowai-commit
description: Automated commit workflow with atomic grouping
disable-model-invocation: true
---

# Commit Workflow

## Overview

Automated workflow to prepare, group, and commit changes following "Atomic Commit" principles and Conventional Commits.

## Context

<context>
The project follows Conventional Commits 1.0.0 and uses a structured documentation system in `./documents`. All changes must be reflected in the documentation.
</context>

## Rules & Constraints

<rules>
1. **Consolidation-First Commits**: Default to ONE commit. Split ONLY when changes are **genuinely independent** (different business purpose, no causal relationship):
   - **Default**: ALL changes related to the same purpose → ONE commit. This includes: implementation code + its tests + its documentation + its configuration.
   - **Split trigger**: Changes serve **different, unrelated purposes** (e.g., an unrelated bug fix mixed with a feature, or a dependency update unrelated to the feature being developed).
   - **User override**: If the user explicitly asks to split (e.g., "split them", "separate X from Y"), follow the user's request.
   - Documentation describing a code change belongs in the SAME commit as that code.
   - `docs:` type ONLY when changes are exclusively in documentation unrelated to any code change.
   - `style:` type ONLY when changes are exclusively formatting/style unrelated to any logic change.
   - **Anti-patterns (DO NOT split these into separate commits)**:
     - Feature code + tests for that feature → 1 commit
     - Feature code + docs describing that feature → 1 commit
     - Refactored function + updated imports across files → 1 commit
     - Config change required by a feature + the feature code → 1 commit
2. **Automation**: Automatically group and commit changes. DO NOT ask the user for permission to split commits.
3. **Dependency Updates**: ALWAYS use `build:` prefix for dependency and configuration updates (e.g., `build: update dependencies`). Do NOT use `chore:` type.
4. **Strict Commits**: Compose messages in **English** per Conventional Commits 1.0.0.
   - **MANDATORY**: ALWAYS prefix commit messages with a type (e.g., `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `build:`, `agent:`).
   - **`agent:` type**: Use for changes to AI agent configuration, skills, and rules:
     - **Scope**: Files in `framework/agents/`, `framework/skills/`, `**/AGENTS.md`, `**/CLAUDE.md`, IDE agent/skill directories (`.claude/agents/`, `.claude/skills/`).
     - **Auto-detection**: When ALL staged files match the `agent:` scope paths above, automatically use `agent:` type without asking.
     - **Mixed changes**: If staged files include both agent/skill files AND application code, use the appropriate application type (`feat:`, `fix:`, etc.) — NOT `agent:`.
     - **Example**: `agent: update flowai-commit skill with atomic grouping rules` or `agent(flowai-init): add brownfield detection logic`.
   - **Scope**: MAY use optional scope in parentheses to provide context, e.g., `feat(llm): add retry logic`.
   - **Breaking Changes**: MUST indicate breaking changes by adding a `!` before the colon (e.g., `feat!: change API contract`) OR by adding `BREAKING CHANGE:` in the footer.
   - **CRITICAL**: Commits without these prefixes are STRICTLY FORBIDDEN.
5. **Git Pager**: Use `GIT_PAGER=cat` for all git commands.
6. **Planning**: The agent MUST use a task management tool (e.g., todo write) to track the execution steps.
7. **Documentation First**: Every logical change MUST be reflected in documentation. Commits without corresponding documentation updates (if applicable) are forbidden.
8. **Error Handling**: On any error (commit failure, merge conflict, unexpected git state): investigate the cause, propose a fix method to the user, and **STOP** without making corrections.
</rules>

## Instructions

<step_by_step>

1. **Initialize**
   - Use a task management tool (e.g., todo write) to create a plan based on these steps.
   - Run `git status` to identify ALL changes: modified (unstaged), staged, and **untracked** files.
   - If working directory is clean (no changes at all), report "Nothing to commit" and STOP.
2. **Documentation Audit & Compression** _(mandatory — do NOT skip)_
   - **Requirement sources**: Requirements come from TWO sources: (1) the git diff (new exports, changed signatures, new modules imply requirements), (2) the conversation history (user messages requesting behavior = requirements, e.g. "X should do Y", "add Z", "make it so that..."). Check BOTH sources.
   - **Check each doc file** (if `./documents` exists):
     - `requirements.md` — check diff AND conversation history for new/changed/removed functional or non-functional requirements. If found → update. If not → note "no requirement changes".
     - `design.md` — check diff for new/changed/removed components, data structures, APIs, or architecture decisions. If found → update. If not → note "no design changes".
     - `AGENTS.md` — check diff for changes to project rules, agent definitions, or conventions. If found → update. If not → note "no agent rule changes".
     - `README.md` — check diff for changes visible to end users (new features, changed behavior, updated setup/troubleshooting). If found → update. If not → note "no user-facing changes".
   - **Apply Compression Rules**:
     - Use **combined extractive + abstractive summarization** (preserve all facts, minimize words).
     - Use compact formats: lists, tables, YAML, or Mermaid diagrams.
     - Optimize lexicon: use concise language, remove filler phrases, and use abbreviations after first mention.
   - **Execute Updates**: Perform necessary edits in `./documents` BEFORE proceeding to grouping.
   - **Output Documentation Audit Report** (always, even if no updates needed):
     ```
     ### Documentation Audit
     - requirements.md: [updated | no changes — <reason>]
     - design.md: [updated | no changes — <reason>]
     - AGENTS.md: [updated | no changes — <reason>]
     - README.md: [updated | no changes — <reason>]
     ```
   - **Gate**: If code changes exist but zero documents were updated, re-examine the diff AND conversation history — new exports, new functions, changed signatures, new modules, or user-requested behavior almost always require a `design.md` or `requirements.md` update. Only proceed without updates if you can justify it in the audit report.
3. **Pre-commit Verification**
   - Check for project check command: `deno task check`, `npm run lint`, `make check`, etc. (inspect `deno.json`, `package.json`, `Makefile`).
   - If found, run it. If verification **fails**, report the error and **STOP**. Do NOT proceed to commit.
   - If no check command found, note "No automated checks configured" and proceed.
4. **Atomic Grouping Strategy (Subagent)**
   - Use the `flowai-diff-specialist` subagent to analyze changes and generate a commit plan.
   - Pass the following prompt to the subagent: "Analyze the current git changes. Default to ONE commit for all changes. Split into multiple commits ONLY if changes serve genuinely different, unrelated purposes. If the user explicitly requested a split, follow that request. Return a JSON structure with proposed commits."
   - The subagent will return a JSON structure with proposed commits.
   - **Review the plan critically**: If the subagent proposes >2 commits, verify each split is justified by genuinely independent purposes. Merge groups that serve the same purpose.
   - **Formulate a Commit Plan** based on the subagent's output:
     - Default: all changes = one commit.
     - Split only when changes serve different, unrelated purposes OR the user explicitly requested a split.
     - Documentation describing a code change goes in the same commit as that code.
      - Use appropriate type: `feat:`, `fix:`, `refactor:`, `build:`, `test:`, `agent:`, `docs:` (standalone only), `style:` (standalone only).
   - _Hunk-level splitting (isolating changes within a single file) is an exceptional measure. Use ONLY when the user explicitly requests it or when changes within one file serve genuinely unrelated purposes._
5. **Commit Execution Loop**
   - **Iterate** through the planned groups:
     1. Stage specific files for the group.
     2. Verify the staged content matches the group's intent.
     3. Commit with a Conventional Commits message.
6. **Verify Clean State**
   - Run `git status` to confirm all changes are committed.
   - If uncommitted changes remain, investigate and report to the user.
7. **Session Complexity Check → Suggest Reflect**
   - After all commits are done, analyze the current conversation for complexity signals:
     - Errors or failed attempts occurred (test failures, lint errors, build errors).
     - Agent retried the same action multiple times.
     - User corrected the agent's approach or output.
     - Workarounds or non-obvious solutions were applied.
   - If **any** of these signals are detected, suggest:
     "This session had [errors/retries/corrections/workarounds]. Consider running `/flowai-reflect` to capture improvements for project instructions."
   - If none detected, skip silently.
</step_by_step>

## Verification

<verification>
- [ ] Documentation audit performed and files updated in `./documents`.
- [ ] Compression rules applied (facts preserved, content minimized).
- [ ] Pre-commit verification passed (if configured).
- [ ] Changes grouped by logical purpose (no mixed independent concerns).
- [ ] Commits executed automatically without user prompt.
- [ ] Conventional Commits format used.
- [ ] Session complexity check performed; `/flowai-reflect` suggested if signals detected.
</verification>
