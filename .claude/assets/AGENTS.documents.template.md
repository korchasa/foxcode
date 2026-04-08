# Documentation Rules

Your memory resets between sessions. Documentation is the only link to past decisions and context. Keeping it accurate is not optional — stale docs actively mislead future sessions.

## Hierarchy
1. **`AGENTS.md`**: "Why" & "For Whom". Long-term goal and value proposition. Read-only reference.
2. **Software Requirements Specification (SRS)** (`documents/requirements.md`): "What" & "Why". Source of truth for requirements. Depends on vision.
3. **Software Design Specification (SDS)** (`documents/design.md`): "How". Implementation details. Depends on SRS.
4. **Whiteboards** (`documents/whiteboards/<YYYY-MM-DD>-<slug>.md`): Temporary plans and notes. One file per task or session.

## Rules
- Follow AGENTS.md, SRS, and SDS strictly — they define what the project is and how it works.
- Workflow for changes: new or updated requirement → update SRS → update SDS → implement. Skipping steps leads to docs-code drift.
- Status markers: `[x]` = implemented, `[ ]` = pending.
- Every `[x]` acceptance criterion must include evidence — file paths with line numbers proving implementation. Format:
  `- [x] Criterion text. Evidence: \`path/to/file.ts:42\`, \`other/file.md:10\``
  Without evidence, the criterion stays `[ ]` — claims without proof are assumptions.

## SRS Format (`documents/requirements.md`)
```markdown
# SRS
## 1. Intro
- **Desc:**
- **Def/Abbr:**
## 2. General
- **Context:**
- **Assumptions/Constraints:**
## 3. Functional Reqs
### 3.1 FR-CMD-EXEC
- **Desc:**
- **Scenario:**
- **Acceptance:**
---

## 4. Non-Functional

- **Perf/Reliability/Sec/Scale/UX:**

## 5. Interfaces

- **API/Proto/UI:**

## 6. Acceptance

- **Criteria:**

````
## SDS Format (`documents/design.md`)
```markdown
# SDS
## 1. Intro
- **Purpose:**
- **Rel to SRS:**
## 2. Arch
- **Diagram:**
- **Subsystems:**
## 3. Components
### 3.1 Comp A
- **Purpose:**
- **Interfaces:**
- **Deps:**
...
## 4. Data
- **Entities:**
- **ERD:**
- **Migration:**
## 5. Logic
- **Algos:**
- **Rules:**
## 6. Non-Functional
- **Scale/Fault/Sec/Logs:**
## 7. Constraints
- **Simplified/Deferred:**
````

## Whiteboards (`documents/whiteboards/`)

- One file per task or session: `<YYYY-MM-DD>-<slug>.md` (kebab-case slug, max 40 chars).
- Examples: `2026-03-24-add-dark-mode.md`, `2026-03-24-fix-auth-bug.md`.
- Do not reuse another session's whiteboard — create a new file. Old whiteboards provide context but may contain outdated decisions.
- Use GODS format (see below) for issues and plans.
- Directory is gitignored. Files accumulate — this is expected.

### GODS Format

```markdown
# [Task Title]

## Goal

[Why? Business value.]

## Overview

### Context

[Full problematics, pain points, operational environment, constraints, tech debt, external URLs, @-refs to relevant files/docs.]

### Current State

[Technical description of existing system/code relevant to task.]

### Constraints

[Hard limits, anti-patterns, requirements (e.g., "Must use Deno", "No external libs").]

## Definition of Done

- [ ] [Criteria 1]
- [ ] [Criteria 2]

## Solution

[Detailed step-by-step for SELECTED variant only. Filled AFTER user selects variant.]
```

## Compressed Style Rules (All Docs)

- No changelogs — docs reflect current state, not history.
- English only (except whiteboards, which may use the user's language).
- Summarize by extracting facts and compressing — no loss of information, just fewer words.
- Every word must carry meaning — no filler, no fluff, no stopwords where a shorter synonym works.
- Prefer compact formats: lists, tables, YAML, Mermaid diagrams.
- Abbreviate terms after first use — define once, abbreviate everywhere.
- Use symbols and numbers to replace words where unambiguous (e.g., `→` instead of "leads to").
