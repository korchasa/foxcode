# Development Commands

## Shell Environment
- All project scripts auto-detect AI agent environments (`CLAUDECODE=1`) and disable ANSI colors automatically. Manual `NO_COLOR=1` prefix is not required when running from Claude Code.
- Scripts also respect the `NO_COLOR` env var (https://no-color.org/) for non-agent contexts.

## Standard Interface
- `check` - The main command for comprehensive project verification. Performs the following steps:
  - build the project
  - comment-scan: "TODO", "FIXME", "HACK", "XXX", debugger calls, linters and formatters suppression
  - code formatting check
  - static code analysis
  - runs all project tests
- `test <path>` - Runs a single test.
- `dev` - Runs the application in development mode with watch mode enabled.
- `prod` - Runs the application in production mode.

## Detected Commands
{{DEVELOPMENT_COMMANDS}}

## Command Scripts
{{COMMAND_SCRIPTS}}
