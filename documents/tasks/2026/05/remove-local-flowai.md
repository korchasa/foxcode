---
date: "2026-05-10"
status: done
implements: []
tags: [chore, cleanup, tooling]
related_tasks: []
---

# Remove local flowai

## Goal
Remove all flowai (AssistFlow) integration artifacts from the FoxCode project so the repo no longer depends on flowai tooling. After this task, no committed file references flowai, and the local `.claude/settings.json` no longer triggers broken flowai hooks on every Write/Edit.

## Overview

### Context
FoxCode previously consumed AssistFlow (flowai) skills/agents distributed via `flow-cli`. Two artifacts remain in this checkout:
- `.flowai.yaml` (committed, project root) — declares ide=`claude` and packs `core/deno/devtools/engineering/typescript`. Consumed by `flow-cli` to populate `.claude/`.
- `.claude/settings.json` (gitignored per commit `2b52d10`, local) — registers two PostToolUse hooks: `deno run -A .claude/scripts/flowai-skill-structure-validate/run.ts` and `.../flowai-mermaid-validate/run.ts`.

The user wants flowai gone from this project. Global flowai skills under `~/.claude/skills/` are out of scope (user-global, not project-local).

### Current State
- `.flowai.yaml` present, tracked by git (committed `27 Mar`).
- `.claude/` is gitignored; only `.claude/settings.json` exists locally.
- `.claude/scripts/` directory is **absent** — the two flowai hooks point at non-existent files. Hooks fail silently on every Write/Edit (timeout=30s, no fatal effect, but noise/latency).
- `AGENTS.md`, `README.md`, `documents/requirements.md`, `documents/design.md` — no flowai mentions.
- No FR-* in SRS covers this. Operational chore.

### Constraints
- Project must remain in clean state: `scripts/check.sh` passes after the change (no errors/warnings).
- Do not modify global `~/.claude/` content — only project-local `.claude/` and committed root files.
- `.claude/settings.json` is gitignored; edits to it are local-only and not committed. Document this clearly so other contributors aren't surprised.
- No source code under `extension/`, `foxcode/`, `scripts/` is touched.

## Definition of Done
- [x] `.flowai.yaml` deleted from project root. Evidence: `test ! -f .flowai.yaml && git status --short .flowai.yaml | grep -q '^ D\| D\|D '`.
- [x] No tracked file in the repo references the string `flowai` (case-insensitive). Evidence: `git grep -i flowai -- ':!documents/tasks/**'` exits with 1. (The `documents/tasks/**` path is excluded because this task file legitimately contains the term in its title, tags, and narrative.)
- [x] Local `.claude/` directory is gone. Evidence: `test ! -e .claude`.
- [x] `scripts/check.sh` exits 0 after the change. Evidence: `bash scripts/check.sh && echo PASS`.
- [x] No `.claude/` paths appear in `git status` after the cleanup (verifies `.gitignore` is doing its job and nothing leaked into staging). Evidence: `git status --porcelain | grep -c '^.. \.claude' ; test $? -ne 0` (grep exit 1 = zero matches).

## Solution

**Selected variant: V2 — wipe `.claude/` locally + delete `.flowai.yaml`.**

### Files
- **Delete (tracked)**: `.flowai.yaml` — committed flowai CLI config.
- **Delete (gitignored, local-only)**: `.claude/` directory (currently contains only `settings.json` with broken flowai hooks; `.claude/scripts/` does not exist). Not part of the commit since the path is in `.gitignore`.

### Steps
1. From repo root, run:
   - `git rm .flowai.yaml`
   - `rm -rf .claude/`
2. Verify no tracked file still references flowai:
   - `git grep -i flowai -- ':!documents/tasks/**'` — must exit 1 (no matches outside the task-docs subtree).
3. Run baseline check:
   - `bash scripts/check.sh` — must exit 0.
4. Confirm `.claude/` is fully removed and not staged:
   - `test ! -e .claude`
   - `git status --porcelain` — must show no `.claude/...` entries (gitignore covers it; this just guards against a misconfigured local `.gitignore`).
5. Stage and commit:
   - `git status` — only `.flowai.yaml` deletion staged (and the new task file under `documents/tasks/2026/05/`).
   - Commit message (suggested): `chore: drop local flowai integration`. Body: "Remove `.flowai.yaml` and clean local `.claude/` (flowai hooks pointed at non-existent scripts). Project no longer consumes flowai; global flowai skills under `~/.claude/` unaffected."

### Cross-contributor note
Other contributors who pulled this repo may still have a local `.claude/settings.json` with the same broken hooks. Add a one-liner to the commit body so they can run `rm -rf .claude/` themselves. No committed file enforces this — `.claude/` is gitignored.

### Error handling
- `git rm` fails if `.flowai.yaml` already absent: investigate (someone else removed it concurrently); do not force.
- `scripts/check.sh` fails: STOP per AGENTS.md "Diagnosing Failures". Do not paper over — the file deletion itself cannot break check.sh, so any failure indicates an unrelated pre-existing issue surfaced by running the baseline.

### Out of scope
- Global flowai skills/agents under `~/.claude/skills/`, `~/.claude/agents/` — user-global, not project-local. Untouched.
- `flow-cli` npm/JSR install on the user's machine — separate concern.
- Any historical flowai mentions in git history — preserved as-is (no rewrite).
- `.claude-plugin/marketplace.json` and `foxcode/.claude-plugin/plugin.json` — these are Claude Code Plugin Marketplace manifests, **not** flowai artifacts. They stay.

## Follow-ups
- (deferred from critique #5) Consider adding a one-line note to `AGENTS.md` or `README.md` instructing existing contributors to run `rm -rf .claude/` locally after pulling this change. Out of scope for this task — would expand committed-doc surface for a one-time chore.
