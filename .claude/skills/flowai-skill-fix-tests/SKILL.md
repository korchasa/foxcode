---
name: flowai-skill-fix-tests
description: How to fix tests
---

## HOW TO FIX TESTS

### Phase 1: Understand & Reproduce (before any code changes)

1. Analyze errors: Review logs, error messages, and stack traces to identify the
   module or method where the failure occurs.
2. **[CRITICAL] Run failing test first**: Execute ONLY the failing test to
   confirm the failure and capture the exact error output. This baseline MUST be
   established before any code changes.
3. Study tests: Examine the test code, comments, and descriptions to understand
   the expected behavior.
4. Review codebase: Locate the relevant sections of the code being tested and
   consult documentation, READMEs, or comments to grasp the overall
   architecture.
5. Reproduce issue: Create a minimal example that replicates the error to
   determine if it depends on specific data or configuration.

### Phase 2: Hypothesize & Fix

6. Create hypothesis: Identify the most likely root cause of the error.
7. Test hypothesis: Methodically test the hypothesis, making small, incremental
   changes and documenting each step. Run the failing test after each change.
8. If the hypothesis is incorrect, create a new one and test it again.
9. If the hypothesis is correct, make the minimal changes to the code to fix the
   error.

### Phase 3: Validate

10. **[CRITICAL] Verify**: Run the full test suite to confirm the fix and ensure
    no regressions.

## Verification

- [ ] Failing tests identified and isolated.
- [ ] Root cause determined via hypothesis testing.
- [ ] Minimal fix applied (no production code changed beyond what's needed).
- [ ] Full test suite passes after the fix.
