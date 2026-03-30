---
name: flowai-update
description: >-
  Update flowai framework: sync skills/agents, adapt skills to project specifics, and migrate scaffolded project artifacts.
disable-model-invocation: true
---

# Task: Update flowai Framework

## Overview

Single entry point for updating the flowai framework in a project. Handles CLI update, skill/agent sync, skill adaptation to project specifics, and migration of scaffolded project artifacts. All migration intelligence comes from `flowai sync` output — no manual discovery needed.

## Context

<context>
flowai generates two types of outputs:
- **Synced** (skills/, agents/) — updated automatically by `flowai sync`, then adapted to the project
- **Scaffolded** (AGENTS.md, .devcontainer/, documents/, project-specific configs and scripts) — created once by setup skills (flowai-init, flowai-setup-agent-*, stack-specific configure-commands skills), then owned by the project. Exact artifact list varies by project stack and is declared in each pack's `pack.yaml` `scaffolds:` field.

`flowai sync` overwrites skills with upstream versions. This skill detects the overwrite via `git diff HEAD` and re-adapts, merging upstream changes with previous project customizations. Adaptation state is tracked entirely through git history — no extra frontmatter fields needed.

`flowai sync` outputs an `>>> ACTIONS REQUIRED` section listing exactly which skills changed and which scaffolded artifacts they affect. This skill follows those instructions.
</context>

## Rules & Constraints

<rules>
1. **Explicit sync only**: Never auto-sync. Always run `flowai sync` explicitly.
2. **Per-file confirmation**: Show diffs and ask user before modifying each adapted skill or scaffolded artifact. Never silently overwrite.
3. **Preserve user content**: Only update framework-originated sections. Do not touch project-specific customizations.
4. **No changes without evidence**: Only propose migrations when diffs show relevant changes.
5. **Cross-IDE**: Must work for Cursor, Claude Code, and OpenCode projects.
6. **Mandatory tracking**: Use a task management tool (e.g., todo write) to track execution steps.
7. **Atomic commit**: Stage synced files + adapted skills + migrated artifacts together in one commit.
8. **Parallel adaptation**: Launch one `flowai-skill-adapter` subagent per updated skill — all in parallel.
</rules>

## Instructions

<step_by_step>

1. **Update CLI**
   - Run `flowai --version`. It prints the current version and checks JSR for updates.
   - If not installed, inform the user: `deno install -gArf jsr:@korchasa/flowai` and stop.
   - If the output contains "Update available", run the update command shown in the output (e.g., `deno install -g -A -f jsr:@korchasa/flowai@X.Y.Z`).
   - After updating, run `flowai --version` again to verify.

2. **Sync framework**
   - Run `flowai sync -y --skip-update-check` via shell. Capture the full stdout output.
     - IMPORTANT: `sync` is a **subcommand** — always `flowai sync [flags]`, never bare `flowai [flags]`.
     - Bare `flowai` is blocked in IDE context and will print a help message instead of syncing.

3. **Re-read self after sync (bootstrap)**
   - Check if `flowai-update` itself appears in the sync output (SKILLS UPDATED or SKILLS CREATED).
   - If yes: re-read the updated SKILL.md from disk (e.g., `.claude/skills/flowai-update/SKILL.md`) and **restart from step 4** using the new instructions. This ensures newly added steps take effect immediately.
   - If no: continue with current instructions.

4. **Parse sync output**
   - Look for `>>> ACTIONS REQUIRED:` section in the output.
   - If `>>> NO ACTIONS REQUIRED` appears with no actions section — report "Framework is up to date" and stop.
   - Extract each numbered action item:
     - **CONFIG MIGRATED**: Note that `.flowai.yaml` needs committing.
     - **SKILLS UPDATED**: Extract skill names and their `(scaffolds: ...)` lists.
     - **SKILLS CREATED**: Extract skill names (new skills to adapt from scratch).
     - **SKILLS DELETED**: Note for commit message.
     - **AGENTS UPDATED**: Note for commit message.
     - **ERRORS**: Report to user and stop if critical.

5. **Adapt updated skills to project**
   - Collect all skills from SKILLS UPDATED and SKILLS CREATED lists.
   - For each skill, detect the IDE config directory (e.g., `.claude/skills/<name>/`).
   - Launch one `flowai-skill-adapter` subagent per skill — **all in parallel**. Each subagent receives:
     - Skill name and path to the skill directory
     - The subagent autonomously reads:
       - Working tree SKILL.md (new upstream version, written by sync)
       - `git show HEAD:<path>/SKILL.md` (previous version with project adaptations, if exists)
       - Project context from CLAUDE.md → AGENTS.md (automatic)
   - The subagent performs a 3-way merge:
     - Keeps all upstream changes (new rules, steps, corrections)
     - Preserves project-specific adaptations (custom commands, examples, removed irrelevant sections)
   - Wait for all subagents to complete.
   - Review each adaptation result: show the diff (`git diff HEAD -- <skill-path>`) to the user.
   - Wait for user approval/rejection per skill. Revert rejected adaptations with `git checkout HEAD -- <skill-path>`.

6. **Migrate scaffolded artifacts**
   - For each SKILLS UPDATED entry that has scaffolds listed:
     a. Run `git diff` on the skill directory (e.g., `.claude/skills/flowai-init/`) to understand what changed in the template.
     b. For each scaffolded artifact path listed:
        - **MUST read** the actual project artifact file (e.g., `./AGENTS.md`, `./documents/design.md`).
        - **MUST read** the framework template (e.g., `.claude/skills/flowai-init/assets/AGENTS.template.md`).
        - Compare line-by-line using `git diff --no-index`:
          ```
          git diff --no-index -- .claude/skills/flowai-init/assets/AGENTS.template.md ./AGENTS.md
          ```
        - Primary comparison is **template content vs project artifact**, not just template git history.
     c. Templates contain `{{PLACEHOLDERS}}` — ignore placeholder sections in the diff. Focus on **framework-originated sections** (rules, planning rules, TDD flow, doc formats, standard interface).
     d. Determine: does the project artifact contain all substantive content from the template? If yes — no migration needed. If no — record what's missing.
   - If no gaps found in any artifact — skip to commit.

7. **Propose scaffolded changes**
   - For each affected artifact, show **all three**:
     a. **What changed in template** — cite the diff lines or section names
     b. **Current project artifact section** — show the outdated version (before/quote)
     c. **Proposed update** — show the complete updated section with project-specific content preserved (after/quote)
   - Use diff format or before/after block quotes — make changes visually clear.
   - Clearly explain **why** the change is recommended.

8. **Apply with confirmation**
   - Show per-file diff to the user.
   - Wait for user approval/rejection of each change.
   - Apply only approved changes.

9. **Commit**
   - Stage all synced files + adapted skills + migrated artifacts.
   - Commit with message: `chore(framework): update flowai framework`
   - Include list of adapted skills and migrated artifacts in commit body.

</step_by_step>
