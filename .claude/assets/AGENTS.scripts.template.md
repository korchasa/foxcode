# Development Commands

## Shell Environment
- Always use `NO_COLOR=1` when running shell commands — ANSI escape codes waste tokens and clutter output.
- When writing scripts, respect the `NO_COLOR` env var (https://no-color.org/) — disable ANSI colors when it is set.

## Standard Interface
- `check` — the main command for comprehensive project verification. Runs the following steps in order:
  - build the project
  - comment-scan: "TODO", "FIXME", "HACK", "XXX", debugger calls, linter and formatter suppression markers
  - code formatting check
  - static code analysis
  - all project tests
- `test <path>` — runs a single test file or test suite.
- `dev` — runs the application in development mode with watch mode enabled.
- `prod` — runs the application in production mode.

## Detected Commands
{{DEVELOPMENT_COMMANDS}}

## Command Scripts
{{COMMAND_SCRIPTS}}
