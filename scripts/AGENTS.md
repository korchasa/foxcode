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
- **Load Extension**: `about:debugging` -> This Firefox -> Load Temporary Add-on -> `foxcode/extension/manifest.json`
- **Install Channel deps**: `cd foxcode/channel && npm install`
- **Start Channel server**: `cd foxcode/channel && npm start`
- **Verify Claude CLI**: `claude --version`
- **Verify Codex CLI**: `codex --version`
- **Tier-4 IDE acceptance**: `scripts/test-ide.sh` (requires deno, opencode, claude, codex, python3, npx; costs LLM tokens)

## Command Scripts
- `scripts/check.sh` - Comment scan, validate manifest.json, JS syntax check for `foxcode/extension/` and `foxcode/channel/`. Opt-in: `FOXCODE_SMOKE=1 bash scripts/check.sh` additionally runs the npx-channel smoke test.
- `scripts/dev.sh` - Open Firefox with extension loaded (via `web-ext run` if available)
- `scripts/release.sh [--dry-run] X.Y.Z` - **Local preview only.** Mirrors the lock-step SemVer bump performed by `.github/workflows/ci.yml::auto-release` (manifest.json, plugin.json, channel/package.json, channel/package-lock.json, opencode/package.json, pinned `foxcode-channel@…` literal in `foxcode/.mcp.json`) so the operator can inspect the diff before pushing. Does NOT commit, tag, or publish — CI does that on push to main. The script never prints `npm publish` follow-ups (those run inside CI with `NPM_TOKEN`).
- `scripts/test-npx-channel.sh [--print]` - Smoke test for the published `foxcode-channel` npm package: runs `npx -y foxcode-channel@<version-from-channel/package.json> --version` in an isolated `HOME`/`npm_config_cache`.
