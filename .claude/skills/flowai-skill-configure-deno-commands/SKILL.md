---
name: flowai-skill-configure-deno-commands
description: Configure and maintain Deno development commands (check, test, dev, prod). Use when the user wants to set up or update the standard command interface in deno.json and scripts/ directory.
---

# Configure Deno Commands

This skill ensures a standardized development interface using Deno tasks and scripts.

## Context

This skill can be invoked:
- **Standalone**: When a user wants to fix or update their Deno commands.
- **From flowai-init**: During project initialization to set up the standard interface.

## Standard Interface

The project must support these commands in `deno.json`:

- `deno task check`: Comprehensive verification (build, lint, fmt, static analysis, tests).
- `deno task test`: Run all tests or a specific test if a path is provided.
- `deno task dev`: Run in development mode with watch mode.
- `deno task prod`: Run in production mode.

## Rules & Constraints

1. **Idempotency**: Check existing `scripts/` and `deno.json` tasks before creating. Do not overwrite existing scripts unless user confirms.
2. **Scripts Location**: All complex logic must reside in `.ts` files within the `scripts/` directory.
3. **Task Definitions**: `deno.json` should point to these scripts.
4. **Standard Interface Compliance**: The `check.ts` script must implement the full verification checklist.
5. **Exit Codes**: Scripts must return non-zero exit codes on failure to break CI/CD and agent workflows.
6. **No External Dependencies**: Generated scripts must only use Deno built-in APIs and `@std/` stdlib. No cliffy, no npm packages.
7. **Parallel Execution**: Independent checks (fmt, lint, test, type-check) MUST run in parallel, not sequentially.
8. **Sequential Prerequisites**: If the project has build/codegen steps whose output is needed by subsequent checks, those steps MUST complete before parallel checks start.
9. **Buffered Output**: Each parallel command's stdout/stderr MUST be buffered (piped, not inherited) to prevent interleaving.
10. **Real-Time Progress**: Print a status line when each command starts and when it finishes (pass/fail).
11. **Output Ordering**: After all checks complete, print buffered output of passed checks first, then ALL failed checks at the end - for easy debugging.
12. **No Output Loss**: ALL stdout and stderr from every check MUST be printed regardless of success/failure.

## Workflow

1. **Analyze**: Check existing `deno.json` and `scripts/`.
2. **Scaffold Scripts**: Create `scripts/check.ts` if missing. The script must satisfy all Rules & Constraints above (parallel execution, buffered output, failed-last ordering, no external deps).
3. **Configure Tasks**: Update `deno.json` tasks to reference the scripts.
4. **Verify**: Run `deno task check` to ensure everything works.

## Examples

### deno.json tasks
```json
{
  "tasks": {
    "check": "deno run -A scripts/check.ts",
    "test": "deno test -A",
    "dev": "deno run --watch -A src/main.ts",
    "prod": "deno run -A src/main.ts"
  }
}
```

## Verification

- [ ] `scripts/check.ts` exists and is executable.
- [ ] `deno.json` contains all standard tasks.
- [ ] `deno task check` passes cleanly.
