---
name: flowai-review-and-commit
description: "Composite command: review changes then commit only if approved. Inlines flowai-review and flowai-commit with a verdict gate between them."
disable-model-invocation: true
---

# Task: Review and Commit

## Overview

Two-phase command: first review current changes (QA + code review), then commit
only if approved. A verdict gate between the phases ensures only approved changes
get committed.

## Context

<context>
The user has completed a coding task and wants a single command to review and
commit. This command inlines both workflows:
1. **Phase 1 — Review** (from `flowai-review`): QA + code review, produces verdict
2. **Phase 2 — Commit** (from `flowai-commit`): documentation audit, verification,
   atomic grouping, commit

The gate logic prevents committing code that has critical issues.

NOTE: The step_by_step sections of Phase 1 and Phase 2 are kept in sync with
flowai-review/SKILL.md and flowai-commit/SKILL.md respectively. The sync check
script (scripts/check-skill-sync.ts) verifies this — if you change one, update
the other.
</context>

## Rules & Constraints

<rules>
1. **Two Phases**: Execute Phase 1 (review) fully before considering Phase 2
   (commit). Never interleave.
2. **Gate Logic**: After Phase 1, check the verdict. Only **Approve** proceeds
   to Phase 2. **Request Changes** or **Needs Discussion** → output the review
   report and STOP. Do not commit.
3. **No partial commit**: If Phase 1 itself fails (errors, crashes), STOP — do
   not proceed to Phase 2.
4. **Transparency**: Output both review findings and commit results to the user.
5. **Planning**: Use a task management tool (e.g., `todo_write`, `todowrite`)
   to track steps.
</rules>

## Instructions

<step_by_step>

1. **Empty Diff Guard**
   - Run `git diff --stat`, `git diff --cached --stat`, and
     `git status --short`.
   - If there are NO changes (no diff, no staged files, no untracked files),
     report "No changes to review" and STOP.

2. **Pre-flight Project Check**
   - If source code files were changed since the last successful project check
     in this session (or if no check has been run yet), run the project check
     command (`scripts/check.sh`) NOW, before starting the review.
   - Skip ONLY if no code files were modified since the last successful check
     run in this session.
   - If the check fails: report failures immediately, then continue with the
     review — failures will be included in the final report as `[critical]`.
   - If no check command is found: note "No automated checks configured" and
     proceed.

3. **Gather Context**
   - If you don't know the content of `documents/requirements.md` (SRS) and `documents/design.md` (SDS) — read them now.
   - Create a review plan in the task management tool.
   - Collect the diff: `git diff` (unstaged), `git diff --cached` (staged),
     or `git log --oneline <base>..HEAD` + `git diff <base>..HEAD` for
     branch-based changes.
   - **Untracked files**: `git diff` does NOT show untracked files. Check
     `git status` output from step 1 — for each untracked file, read its
     content directly and include it in the review scope.
   - Read the original user request and the plan (whiteboard in `documents/whiteboards/` / task list).
   - Look for project conventions in config files (linter, formatter configs).
     Rely on conventions visible in the diff and surrounding code.

   **Parallel Delegation** (after gathering context):
   - **Small diff shortcut**: If `git diff --stat` shows < 50 changed lines,
     skip delegation — run all steps inline (overhead not justified).
   - Otherwise, delegate **2 independent tasks in parallel** (via subagents,
     background tasks, or IDE-specific parallel execution — e.g., `Task`,
     `Agent`, `parallel`):
     - **SA1**: If pre-flight check (step 2) already ran, skip SA1. Otherwise,
       run the project check command (`scripts/check.sh`). Delegate to a
       console/shell-capable agent (e.g., `flowai-console-expert`). Return
       pass/fail + full output.
     - **SA2**: Run hygiene grep scan on diff output — search for `TODO`,
       `FIXME`, `HACK`, `XXX`, `console.log`, `temp_*`, `*.tmp`, `*.bak`,
       hardcoded secrets patterns. Delegate to a console/shell-capable agent.
       Return findings list.
   - **Fallback rule**: If any delegated task fails or times out, the main
     agent performs that step inline. No hard dependency on delegation success.
   - Continue with steps 4, 6, 7, 8 (main agent review) while delegated
     tasks run.

4. **QA: Task Completion**
   - Map each requirement/plan item to concrete changes in the diff.
   - Flag requirements with no corresponding changes as `[critical] Missing`.
   - Flag plan items marked "done" but not present in diff as
     `[critical] Phantom completion`.
   - Check for regressions: do changed files break existing functionality?

5. **QA: Hygiene** _(use SA2 result if available; otherwise run inline)_
   - If SA2 completed: review its findings, deduplicate with own Code Review
     findings, and merge into the report.
   - If SA2 failed/timed out or skipped (small diff): perform inline:
   - **Temp artifacts**: New `temp_*`, `*.tmp`, `*.bak`, debug `console.log`/
     `print` statements, hardcoded secrets or localhost URLs.
   - **Unfinished markers**: New `TODO`, `FIXME`, `HACK`, `XXX` introduced in
     this diff (distinguish from pre-existing ones).
   - **Dead code**: Commented-out blocks, unused imports/variables/functions
     added in this diff.
   - **Deleted directories**: If the diff deletes an entire skill, agent, or
     module directory (not just individual files), flag as
     `[warning] Entire directory deleted — confirm intentional` and ask the
     user to verify before proceeding.

6. **Code Review: Design & Architecture**
   - **Responsibility**: Does each changed file/module stay within its stated
     responsibility? Flag scope creep.
   - **Coupling**: Are new dependencies (imports, API calls) justified?
     Flag tight coupling or circular dependencies.
   - **Abstraction**: Is the level of abstraction appropriate? Flag
     over-engineering (unnecessary interfaces, premature generalization) and
     under-engineering (god-functions, duplicated logic).

7. **Code Review: Implementation Quality**
   - **Naming**: Are new identifiers (vars, funcs, types) clear and consistent
     with project conventions?
   - **Error handling**: Are errors handled explicitly? Flag swallowed
     exceptions, missing error paths, generic catch-all handlers.
   - **Edge cases**: Are boundary conditions (null, empty, overflow, concurrent
     access) handled?
   - **Types & contracts**: Are type signatures precise? Flag `any`, untyped
     parameters, missing return types (where project conventions require them).
   - **Tests**: Do new/changed behaviors have corresponding tests? Are existing
     tests updated for changed behavior?

8. **Code Review: Readability & Style**
   - **Consistency**: Do changes follow the project's established patterns
     (file structure, naming, formatting)?
   - **Comments**: Are non-obvious decisions explained? Flag misleading or
     stale comments.
   - **Complexity**: Flag functions > 40 lines or cyclomatic complexity spikes
     introduced in this diff.
   - **Clarity**: Flag clarity sacrificed for brevity — nested ternaries, dense
     one-liners, overly compact expressions. Explicit code is preferred over
     clever short forms.

9. **Run Automated Checks** _(collect results from step 2 and/or SA1)_
   - If pre-flight check (step 2) already ran: use its result. Do NOT re-run.
   - If SA1 completed with a different/broader check: merge its results.
   - If neither ran (no check command found): explicitly note "No automated
     checks configured" in the report — do not silently skip.

10. **Final Report**
   Output a structured report with the verdict on the FIRST line:

   ```
   ## Review: [Approve | Request Changes | Needs Discussion]

   ### QA Findings
   - [severity] file:line — description

   ### Code Review Findings
   - [severity] file:line — description

   ### Automated Checks
   - [pass|fail|skipped] command — summary

   ### Summary
   - Requirements covered: X/Y
   - Critical issues: N
   - Warnings: N
   - Nits: N
   ```

   If **no issues**: short confirmation "Changes look good. All requirements
   covered, no issues found."

</step_by_step>

### Verdict Gate

After completing the review report above:
- If verdict is `## Review: Approve` → proceed to Phase 2 below.
- If verdict is `## Review: Request Changes` or `## Review: Needs Discussion`
  → output the full review report to the user and **STOP**. Do NOT proceed.
- If the review phase crashed or produced no verdict → report the error and
  **STOP**.

### Phase 2 — Commit

<step_by_step>

1. **Initialize**
   - Use a task management tool (e.g., todo write) to create a plan based on these steps.
   - Run `git status` to identify ALL changes: modified (unstaged), staged, and **untracked** files.
   - If working directory is clean (no changes at all), report "Nothing to commit" and STOP.
2. **Documentation Audit & Compression** _(mandatory — do NOT skip)_
   - **Gather change context** from three sources:
     1. **Git diff**: `git diff` (unstaged) + `git diff --cached` (staged). Primary source of WHAT changed.
     2. **Active whiteboard**: If the user referenced a whiteboard or plan in this session, read that specific file from `documents/whiteboards/`. Use it to understand the WHY behind changes. Do NOT scan all whiteboards — only read one explicitly linked to the current task.
     3. **Session context**: User messages in this conversation explaining intent, decisions, or requirements.
   - **Discover document list** (if `./documents` exists):
     - If `documents/AGENTS.md` exists → read its `## Hierarchy` section → extract all document paths listed there.
     - Classify each document: `READ-ONLY` (explicitly marked), `derived` (e.g. README — "Derived from..."), or `editable` (default).
     - If `documents/AGENTS.md` does not exist → use default list: `requirements.md`, `design.md`, `AGENTS.md` (all editable).
   - **Audit each editable document** against the combined context (diff + whiteboard + session):
     - For each document: does the change context reveal new/changed/removed information relevant to this document's scope? If yes → update. If no → note reason.
     - For `derived` documents (e.g. README.md): update only when changes are significant (new public API, changed installation steps, new features).
     - Skip `READ-ONLY` documents entirely.
   - **Apply Compression Rules**:
     - Use **combined extractive + abstractive summarization** (preserve all facts, minimize words).
     - Use compact formats: lists, tables, YAML, or Mermaid diagrams.
     - Optimize lexicon: use concise language, remove filler phrases, and use abbreviations after first mention.
   - **Execute Updates**: Perform necessary edits in `./documents` BEFORE proceeding to grouping.
   - **Output Documentation Audit Report** (always, even if no updates needed):
     ```
     ### Documentation Audit
     - <doc-name>: [updated | no changes — <reason>] (for each discovered document)
     - Whiteboard context: [used <filename> | none found]
     ```
   - **Gate**: If code changes exist but zero documents were updated, re-examine — new exports, functions, changed signatures, or new modules almost always require an update. Only proceed without updates if justified in the audit report.
3. **Atomic Grouping Strategy (Subagent)**
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
4. **Commit Execution Loop**
   - **Iterate** through the planned groups:
     1. Stage specific files for the group.
     2. Verify the staged content matches the group's intent.
     3. Commit with a Conventional Commits message.
5. **Whiteboard Cleanup** _(only if a whiteboard was used in step 2)_
   - If the user referenced a whiteboard and it contains a `## Definition of Done` (or similar checklist):
     a. Compare each DoD item against the committed changes.
     b. If **all** DoD items are satisfied by the committed code and documentation → delete the whiteboard file (`git rm`) and include the deletion in the commit (amend the last commit or create a separate `docs: remove completed whiteboard` commit).
     c. If **any** DoD item is NOT satisfied → ask the user: "The whiteboard has incomplete items: [list]. Delete it anyway or keep for next session?" Act on the user's answer.
   - If the whiteboard has no DoD section → ask the user whether the planned work is complete and whether to delete the whiteboard.
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

### Final Combined Report

Output a combined summary:
- **Review**: verdict + key findings (or "no issues found")
- **Commit**: files committed, commit message(s)

## Verification

<verification>
[ ] Empty diff guard checked before starting.
[ ] Pre-flight project check executed (or skipped — no code changes since last check).
[ ] Review phase completed with structured report.
[ ] Verdict gate enforced: only Approve proceeds to commit.
[ ] Documentation audit performed and files updated.
[ ] Changes grouped by logical purpose.
[ ] Commits executed with Conventional Commits format.
[ ] Whiteboard cleanup: completed whiteboards deleted, partial whiteboards confirmed with user.
[ ] Session complexity check performed; `/flowai-reflect` suggested if signals detected.
[ ] Both review and commit results reported to user.
</verification>
