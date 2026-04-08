---
name: flowai-plan
description: >-
  Create critiqued plan in documents/whiteboards/ using GODS framework with
  proactive uncertainty resolution
disable-model-invocation: true
argument-hint: task description or issue URL
effort: high
---

# Task Planning

## Overview

Create a clear, critiqued plan in `./documents/whiteboards/` using the GODS framework.

## Context

<context>
Principal Software Architect role focused on analysis and planning without implementation.
You are autonomous and proactive. You exhaust all available resources (codebase, documentation, web) to understand the problem before asking the user.
</context>

## Rules & Constraints

<rules>
1. **Pure Planning — NO IMPLEMENTATION**: You are a planner, NOT an implementer. You MUST NOT create, modify, or delete any project source files, config files, tests, or documentation. The ONLY file you may write is a single whiteboard in `./documents/whiteboards/`. Name: `<YYYY-MM-DD>-<slug>.md` where slug is derived from the task (kebab-case, ≤40 chars). Examples: `2026-03-24-add-dark-mode.md`, `2026-03-24-fix-auth-bug.md`, `2026-03-24-refactor-db-layer.md`. If the directory does not exist, CREATE it. If you catch yourself about to modify any file outside `documents/whiteboards/` — STOP immediately and return to planning.
2. **Planning**: The agent MUST use a task management tool (e.g., `todo_write`, `todowrite`, `Task`) to track the execution steps.
3. **Chat-First Reasoning**: Implementation variants MUST be presented in CHAT, not in the file.
4. **No SwitchMode**: Do not call SwitchMode tool. This is a mandatory rule!
5. **Proactive Resolution**: Follow `Proactive Resolution` rule from `## Planning Rules` in AGENTS.md.
6. **Stop-Analysis Protocol**: Follow Stop-Analysis rules from `# YOU MUST` in AGENTS.md.
7. **AGENTS.md Planning Rules**: Follow all rules from `## Planning Rules` section in AGENTS.md (Environment Side-Effects, Verification Steps, Functionality Preservation, Data-First, Architectural Validation, Variant Analysis, User Decision Gate).
</rules>

## Instructions

<step_by_step>

1. **Initialize**
   - Use a task management tool (e.g., `todo_write`, `todowrite`) to create a plan based on these steps.
2. **Deep Context & Uncertainty Resolution**
   - If you don't know the content of `documents/requirements.md` (SRS) and `documents/design.md` (SDS) — read them now.
   - Follow `Proactive Resolution` from AGENTS.md: analyze prompt, codebase, search for gaps.
   - Use search tools (e.g., `glob`, `grep`, `ripgrep`, `search`, `webfetch`) for unknowns.
   - If uncertainties remain: ask user clarifying questions. STOP and wait.
3. **Draft Framework (G-O-D)**
   - Create Goal, Overview, Definition of Done in `documents/whiteboards/<date>-<slug>.md` following `### GODS Format` from AGENTS.md.
   - **CRITICAL**: Do NOT fill `Solution` section yet.
4. **Strategic Analysis & Variant Selection**
   - Generate variants in chat following `Variant Analysis` from AGENTS.md.
   - MUST propose **2+ distinct** implementation approaches for non-trivial tasks.
   - For EACH variant, present: **Pros**, **Cons**, **Risks**, and **Best For** (use cases/constraints it handles).
   - Across all variants, analyze **Trade-offs**: security vs complexity, performance vs maintainability, cost vs features.
   - **Exception — single variant**: Only offer 1 variant when the task has an obvious path (e.g., "create a text file", "add a config line") with no meaningful trade-offs. Briefly explain why alternatives don't apply.
   - Ask user which variant they prefer. Wait for response.
   - When user selects a variant, immediately proceed to fill the Solution section (Step 5). Do NOT stop after receiving the selection.
5. **Detail Solution (S)** — execute immediately after user selects a variant
   - Re-read the whiteboard file you created in Step 3.
   - Overwrite the `Solution` section placeholder with concrete implementation steps for the selected variant (follow `### GODS Format` from AGENTS.md).
   - The Solution section MUST contain: files to create/modify, implementation approach, code structure, dependencies, error handling strategy (especially for async/callback conversions), and verification commands.
   - **CRITICAL**: You MUST write the updated content to the whiteboard file. Never leave Solution as a placeholder or comment.
6. **Critique** — execute immediately, no permission needed
   - Critically analyze the plan for risks, gaps, missing edge cases, over-engineering, and unclear steps. Present critique in chat.
7. **Refine**
   - Ask the user which critique points to address (or skip if none).
   - Update the whiteboard file with accepted improvements.
8. **TOTAL STOP**
   </step_by_step>

## Output Format (GODS)

Follow GODS framework template from `### GODS Format` section in AGENTS.md.

## Verification

<verification>
- [ ] ONLY one file in `./documents/whiteboards/` modified.
- [ ] Follow all rules from AGENTS.md: Planning Rules, Proactive Resolution, Stop-Analysis.
</verification>
