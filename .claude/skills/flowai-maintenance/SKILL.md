---
name: flowai-maintenance
description: >-
  Perform a comprehensive "Lead Engineer" audit: structure, consistency, code quality, technical debt, documentation coverage, terminology, instruction coherence, and tooling relevance checks.
disable-model-invocation: true
---

# Task: Project Maintenance & Health Audit

## Overview

Execute a rigorous 9-point maintenance sweep to identify structural deviations, documentation inconsistencies, dead code, complexity hotspots, technical debt, missing code documentation, terminology drift, instruction coherence issues, and tooling relevance problems. All findings must be actionable and saved to a whiteboard in `documents/whiteboards/`.

## Context

<context>
This command is the "Garbage Collector" and "Building Inspector" for the project. It ensures the codebase remains maintainable, documented, and aligned with architectural standards.
It addresses:
1.  **Structure**: Files in wrong places.
2.  **Consistency**: Docs vs. Code truth.
3.  **Hygiene**: Dead code, unused imports, weak tests.
4.  **Complexity**: "God objects" and massive functions.
5.  **Debt**: Accumulated TODOs.
6.  **Language**: Inconsistent terminology.
7.  **Doc Coverage**: Missing explanations in code.
8.  **Instruction Coherence**: Contradictions and ambiguities across project instructions.
9.  **Tooling Relevance**: Skills, agents, rules, and hooks that don't match the project.
</context>

## Rules & Constraints

<rules>
1.  **Output Target**: All findings MUST be written to `documents/whiteboards/<YYYY-MM-DD>-maintenance.md`. Start with a timestamped header.
2.  **Precision**: Use specific thresholds (e.g., File > 500 lines).
3.  **Constructive**: Every "Issue" must have a "Proposed Fix".
4.  **Holistic**: Scan `documents/`, `.claude/`, `foxcode/`, `extension/`, `scripts/`, and source code directories.
5.  **Mandatory**: Use a task management tool (e.g., `todo_write`, `todowrite`) to track progress through the 9 phases.
6.  **Language Agnostic**: Adapt checks (imports, syntax, test patterns) to the primary languages of the project (JavaScript ES6+, Node.js ES modules, HTML, CSS).
</rules>

## Instructions

<step_by_step>

1. **Initialize & Plan**
   - Use a task management tool (e.g., `todo_write`, `todowrite`) to create a plan covering the 9 phases below.
   - Check `documents/whiteboards/` for existing maintenance reports. Review prior reports for context, but
     always create a new report file.
   - Identify project's primary language and source directories.

2. **Phase 1: Structural Integrity**
   - **File placement**: Check that all source files reside in expected directories per project conventions (`foxcode/channel/`, `extension/`, `scripts/`, `documents/`). Flag files at wrong levels.
   - **Dead directories**: Identify empty or orphaned directories with no purpose.
   - **Naming conventions**: Verify file and directory names follow project conventions (case, separators).
   - **Config files**: Ensure project config files (`package.json`, `manifest.json`, `.mcp.json`) are at expected locations.

3. **Phase 2: Code Hygiene & Dependencies**
   - **Dead Code**: Identify exported/public symbols in source directories that
     are never imported/called elsewhere.
   - **Unused Imports**: Scan source files for imports/includes that are not
     used in the file body.
   - **Test Quality**: Read test files (e.g., `*.test.*`, `*.test.mjs`). Flag tests that:
     - Have no assertions.
     - Use trivial assertions (e.g., `expect(true).toBe(true)`).
     - Are commented out.

4. **Phase 3: Complexity & Hotspots**
   - **Files**: Flag any source file exceeding **500 lines**.
   - **Functions**: Scan for functions/methods exceeding **50 lines**.
   - **God Objects**: Identify classes/modules with mixed concerns (e.g.,
     logic + UI + WebSocket handling in one file).

5. **Phase 4: Technical Debt Aggregation**
   - **Scan**: Search for `TODO`, `FIXME`, `HACK`, `XXX` tags in the codebase.
   - **Group**: Organize by file/module.
   - **Analysis**: Flag any that look critical or like "temporary" fixes that
     became permanent.

6. **Phase 5: Consistency (Docs vs. Code)**
   - **Terminology**: Extract key terms from `README.md` and `documents/`. Check
     if code uses different synonyms (e.g., "User" in docs vs "Customer" in
     code).
   - **Drift**: Pick 3 major claims from `documents/*.md` (e.g., "The system
     handles X asynchronously"). Verify if the code actually does that.

7. **Phase 6: Code Documentation Coverage**
   - **Rule**: Every file, class, method, and exported function MUST have
     documentation (JSDoc).
   - **Check**:
     - **Responsibility**: Does the comment explain _what_ it does?
     - **Nuances**: For complex logic (cyclomatic complexity > 5 or > 20 lines),
       are there examples or edge case warnings?
   - **Scan**: primary source directories (`foxcode/channel/`, `extension/`).
   - **Report**: List undocumented symbols.

8. **Phase 7: Instruction Coherence**
   - **Scope**: Read all instruction files that guide agent/developer behavior:
     `CLAUDE.md` (root and nested), `AGENTS.md` files, `documents/requirements.md`,
     `documents/design.md`, and any rules/conventions files.
   - **Contradictions**: Identify mutually exclusive rules across or within files
     (e.g., "use tabs" in one section vs. "use 2 spaces" in another; "never mock"
     vs. "mock freely").
   - **Ambiguities**: Flag vague or open-ended instructions that could be
     interpreted in conflicting ways by different agents or sessions.
   - **Redundancy**: Note duplicated rules across files that may diverge over time.
   - **Scope conflicts**: Check that nested instruction files (`subdir/CLAUDE.md`)
     don't silently override root-level rules without explicit justification.
   - **Coherence verdict**: For each issue, state which files/sections conflict and
     propose a resolution (keep one, merge, or clarify).

9. **Phase 8: Tooling Relevance**
   - **Scope**: Inventory all installed skills (`.claude/skills/`, `foxcode/skills/`),
     agents/subagents (`.claude/agents/`), hooks (`.claude/hooks/`,
     `.husky/`), and rules files.
   - **Stack match**: Compare each item against the project's declared tooling stack
     (from `AGENTS.md` or `CLAUDE.md`) and actual source files. Flag items designed
     for a different tech stack (e.g., Python skill in a JavaScript project, Deno
     linting hook in a Node.js project).
   - **Domain match**: Flag agents/skills targeting a domain absent from the project
     (e.g., Kubernetes deployer agent in a project with no K8s manifests or Dockerfiles).
   - **Stale tooling**: Identify skills/agents/hooks that reference tools, commands,
     or frameworks not present in the project (e.g., hook calling `flake8` when no
     Python files exist).
   - **Verdict**: For each mismatch, state what the item expects vs. what the project
     actually uses, and propose a fix (remove, replace with stack-appropriate
     alternative, or add justification).

10. **Phase 9: Reporting**
   - Compile all findings into the whiteboard file with the following format:
     ```markdown
     # Maintenance Report (YYYY-MM-DD)

     ## 1. Structural Issues

     - [ ] File X is in root but should be in Y. (Fix: Move file)

     ## 2. Hygiene & Quality

     - [ ] Unused export `myFunc` in `lib.mjs`. (Fix: Delete)
     - [ ] `background.js` is 550 lines. (Fix: Extract logic to new module)

     ## 3. Technical Debt

     - [ ] 5 TODOs in `server.mjs` regarding error handling.

     ## 4. Consistency

     - [ ] Docs say "User", code says "Client". (Fix: Standardize on User)

     ## 5. Documentation Coverage

     - [ ] `lib.mjs` - function `parseData` missing JSDoc. (Fix: Add JSDoc)
     - [ ] `validator.mjs` missing usage example. (Fix: Add example)

     ## 6. Instruction Coherence

     - [ ] CLAUDE.md: "use tabs" (Code Style) vs "use 2 spaces" (Error Handling). (Fix: Keep tabs, remove conflicting rule)
     - [ ] CLAUDE.md vs AGENTS.md: Test policy differs. (Fix: Align on single policy in AGENTS.md)

     ## 7. Tooling Relevance

     - [ ] Skill `django-migrations` targets Python/Django, project is JavaScript/Node.js. (Fix: Remove skill)
     - [ ] Agent `kubernetes-deployer` references K8s, no K8s manifests in project. (Fix: Remove agent)
     - [ ] Hook `pre-commit-python-lint.sh` runs flake8/black, no Python files exist. (Fix: Remove hook)
     ```

</step_by_step>

## Verification

<verification>
[ ] Checked structural integrity (file placement, naming, configs).
[ ] Scanned for dead code and unused imports.
[ ] Checked file/function length limits (500/50 lines).
[ ] Aggregated all TODO/FIXME tags.
[ ] Verified documentation terminology vs code usage.
[ ] Checked for missing code documentation (File/Class/Method).
[ ] Checked instruction coherence across CLAUDE.md, AGENTS.md, and docs (contradictions, ambiguities, redundancy).
[ ] Checked tooling relevance (skills, agents, hooks vs. project stack and domain).
[ ] Saved structured report to `documents/whiteboards/`.
</verification>
