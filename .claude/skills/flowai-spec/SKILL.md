---
name: flowai-spec
description: >-
  Create structured specification for large features using phased decomposition.
  Produces documents/spec-{name}.md with dependency-ordered phases, atomic tasks,
  explicit boundaries, and per-phase status tracking.
disable-model-invocation: true
---

# Feature Specification

## Overview

Create a structured, decomposed specification in `./documents/spec-{name}.md` for
features too large for a single agent session.

## When to Use

- Use `flowai-spec` when feature spans >3 files AND requires >2 sessions, OR has >5 phases
- Use `flowai-plan` for tasks completable within one agent session
- When unsure: start with `flowai-plan`; if it outgrows a single whiteboard, upgrade to `flowai-spec`

## Context

<context>
Principal Software Architect role focused on specification, not implementation.
You are autonomous and proactive. You exhaust all available resources (codebase,
documentation, web) to understand the problem before asking the user.
</context>

## Rules & Constraints

<rules>
1. **Pure Specification**: MUST NOT write code. Only `./documents/spec-{name}.md`. If the file does not exist, CREATE it.
2. **Planning**: The agent MUST use a task management tool (e.g., `todo_write`, `todowrite`, `Task`) to track execution steps.
3. **Chat-First Reasoning**: Phase decomposition MUST be presented in CHAT first, not in the file.
4. **No SwitchMode**: Do not call SwitchMode tool.
5. **Proactive Resolution**: Follow `Proactive Resolution` rule from `## Planning Rules` in AGENTS.md.
6. **Stop-Analysis Protocol**: Follow Stop-Analysis rules from `# YOU MUST` in AGENTS.md.
7. **AGENTS.md Planning Rules**: Follow all rules from `## Planning Rules` section in AGENTS.md.
8. **Living Document**: Spec status fields are updated during implementation. Implementer MUST update Phase Status (`not-started` -> `in-progress` -> `done`) when starting/completing a phase.
9. **Phase Size Guard**: Each phase SHOULD contain ≤50 requirements and target ≤5 files per task. If exceeded -> split.
10. **Implementation Hints Only in Notes**: Spec describes WHAT and WHY. HOW - only in Notes section as implementation hints (patterns, gotchas, references), not as code.
</rules>

## Instructions

<step_by_step>

1. **Initialize**
   - Use a task management tool (e.g., `todo_write`, `todowrite`) to create a plan based on these steps.

2. **Deep Context & Research**
   - Follow `Proactive Resolution` from AGENTS.md: analyze prompt, codebase, docs.
   - Use search tools (e.g., `glob`, `grep`, `ripgrep`, `search`, `webfetch`) for gaps.
   - If uncertainties remain: ask user clarifying questions. STOP and wait.

3. **Draft Spec Header**
   - Write to `documents/spec-{name}.md` the following sections:
     - Title and metadata table (Status: Draft, Created/Updated dates)
     - Goal (business/user value - why are we building this?)
     - Overview (current state, why now, relevant context)
     - Non-Goals (explicit exclusions - critical for AI agents)
     - Architecture & Boundaries (three-tier: Always / Ask First / Never)
     - Definition of Done (measurable acceptance criteria)
   - **CRITICAL**: Do NOT fill Phases yet.

4. **Decompose into Phases (Chat Only)**
   - Present phase breakdown in chat:
     - Each phase: goal, scope (files/components), dependencies, estimated task count
     - Phases ordered by dependency (foundations first)
     - Target: ≤30-50 requirements per phase (within ~150-200 instruction limit)
   - Present to user. STOP and wait for approval/adjustments.

5. **Detail Phases**
   - Write approved phases into spec file. Each phase contains:
     - Status (not-started / in-progress / done)
     - Prerequisites (which phases must be done first)
     - Goal (what this phase achieves)
     - Scope (files/components affected, target 1-5 files per task)
     - Tasks (numbered list of atomic, testable tasks)
     - Verification (specific commands/checks to confirm phase completion)
     - Notes (implementation hints, gotchas, references)

6. **Critique**
   - Present spec to user in chat and offer to critique it before finalizing.
   - If user agrees, critically analyze the spec for:
     - Missing phases or hidden dependencies
     - Tasks too large (should be split) or too small (should be merged)
     - Vague verification criteria
     - Missing non-goals or boundary gaps
     - Over-specification of trivial parts
   - Present critique in chat.

7. **Refine & Finalize**
   - Ask the user which critique points to address.
   - Update `documents/spec-{name}.md` with accepted improvements.
   - Update Status from "Draft" to "Ready".

8. **TOTAL STOP**

</step_by_step>

## Output Format

```markdown
# Spec: {Feature Name}

| Field   | Value                       |
|---------|-----------------------------|
| Status  | Draft/Ready/In-Progress/Done |
| Created | YYYY-MM-DD                  |
| Updated | YYYY-MM-DD                  |

## Goal

{Why are we building this? Business/user value.}

## Overview

{Current state, why now, relevant context.}

## Non-Goals

<!-- Examples: "No backward compatibility with v1 API", "No UI changes in this phase", "No performance optimization", "No migration of existing data" -->
- {Explicit exclusion 1}
- {Explicit exclusion 2}

## Architecture & Boundaries

### Always (agent autonomy)

- {Things agent can always do}

### Ask First

- {Things requiring user confirmation}

### Never

- {Things agent must never do}

## Definition of Done

- [ ] {Measurable criterion 1}
- [ ] {Measurable criterion 2}

---

## Phase 1: {Name}

**Status:** not-started | **Prerequisites:** none

### Goal

{What this phase achieves.}

### Scope

- {file/component 1}
- {file/component 2}

### Tasks

1. {Atomic, testable task}
2. {Atomic, testable task}

### Verification

- [ ] {Specific check or command}

### Notes

- {Implementation hints, gotchas}

---

## Phase 2: {Name}

...
```

## Verification

<verification>
- [ ] ONLY `documents/spec-{name}.md` modified
- [ ] Each phase has: Goal, Prerequisites, Scope, Tasks, Verification
- [ ] Non-Goals section is non-empty
- [ ] Boundaries (Always/Ask First/Never) are specified
- [ ] No phase exceeds 50 requirements
- [ ] Tasks target ≤5 files each
- [ ] All phases have dependency ordering (no circular deps)
</verification>
