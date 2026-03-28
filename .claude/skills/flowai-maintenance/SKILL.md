---
name: flowai-maintenance
description: >-
  Perform a comprehensive "Lead Engineer" audit: structure, consistency, code quality, technical debt, documentation coverage, and terminology checks.
disable-model-invocation: true
---

# Task: Project Maintenance & Health Audit

## Overview

Execute a rigorous 7-point maintenance sweep to identify structural deviations,
documentation inconsistencies, dead code, complexity hotspots, technical debt,
missing code documentation, and terminology drift. All findings must be
actionable and saved to a whiteboard in `documents/whiteboards/`.

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
</context>

## Rules & Constraints

<rules>
1.  **Output Target**: All findings MUST be written to `documents/whiteboards/<YYYY-MM-DD>-maintenance.md`. Start with a timestamped header.
2.  **Precision**: Use specific thresholds (e.g., File > 500 lines).
3.  **Constructive**: Every "Issue" must have a "Proposed Fix".
4.  **Holistic**: Scan `documents/`, `.cursor/`, and source code directories.
5.  **Mandatory**: Use a task management tool (e.g., `todo_write`, `todowrite`) to track progress through the 7 phases.
6.  **Language Agnostic**: Adapt checks (imports, syntax, test patterns) to the primary language of the project (TS, JS, Py, Go, etc.).
</rules>

## Instructions

<step_by_step>

1. **Initialize & Plan**
   - Use a task management tool (e.g., `todo_write`, `todowrite`) to create a plan covering the 7 phases below.
   - Check `documents/whiteboards/` for existing maintenance reports. Review prior reports for context, but
     always create a new report file.
   - Identify project's primary language and source directories.

2. **Phase 1: Structural Integrity**
   - **File placement**: Check that all source files reside in expected directories per project conventions (e.g., `src/`, `lib/`, `scripts/`). Flag files at wrong levels.
   - **Dead directories**: Identify empty or orphaned directories with no purpose.
   - **Naming conventions**: Verify file and directory names follow project conventions (case, separators).
   - **Config files**: Ensure project config files (`deno.json`, `package.json`, etc.) are at expected locations.

3. **Phase 2: Code Hygiene & Dependencies**
   - **Dead Code**: Identify exported/public symbols in source directories that
     are never imported/called elsewhere.
   - **Unused Imports**: Scan source files for imports/includes that are not
     used in the file body.
   - **Test Quality**: Read test files (e.g., `*.test.*`, `*_test.*`,
     `test_*.py`). Flag tests that:
     - Have no assertions.
     - Use trivial assertions (e.g., `expect(true).toBe(true)`, `assert True`).
     - Are commented out.

4. **Phase 3: Complexity & Hotspots**
   - **Files**: Flag any source file exceeding **500 lines**.
   - **Functions**: Scan for functions/methods exceeding **50 lines**.
   - **God Objects**: Identify classes/modules with mixed concerns (e.g.,
     logic + UI + database in one file).

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
     documentation (JSDoc, Docstring, Rustdoc, etc.).
   - **Check**:
     - **Responsibility**: Does the comment explain _what_ it does?
     - **Nuances**: For complex logic (cyclomatic complexity > 5 or > 20 lines),
       are there examples or edge case warnings?
   - **Scan**: primary source directories.
   - **Report**: List undocumented symbols.

8. **Phase 7: Reporting**
   - Compile all findings into the whiteboard file with the following format:
     ```markdown
     # Maintenance Report (YYYY-MM-DD)

     ## 1. Structural Issues

     - [ ] File X is in root but should be in Y. (Fix: Move file)

     ## 2. Hygiene & Quality

     - [ ] Unused export `myFunc` in `utils.*`. (Fix: Delete)
     - [ ] `main.*` is 550 lines. (Fix: Extract `processLogic` to new file)

     ## 3. Technical Debt

     - [ ] 5 TODOs in `api.*` regarding error handling.

     ## 4. Consistency

     - [ ] Docs say "User", code says "Client". (Fix: Standardize on User)

     ## 5. Documentation Coverage

     - [ ] `utils.*` - function `parseData` missing docs. (Fix: Add docs)
     - [ ] `ComplexClass` missing usage example. (Fix: Add example)
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
[ ] Saved structured report to `documents/whiteboards/`.
</verification>
