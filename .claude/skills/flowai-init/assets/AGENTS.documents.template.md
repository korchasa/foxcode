# Documentation Rules

**CRITICAL:** MEMORY RESETS. DOCS = ONLY LINK TO PAST. MAINTAIN ACCURACY.

## Hierarchy
1. **`AGENTS.md`**: "Why" & "For Whom". Long-term goal/value. READ-ONLY.
2. **Software Requirements Specification (SRS)** (`documents/requirements.md`): "What" & "Why". Source of truth. Depends on VISION.
3. **Software Design Specification (SDS)** (`documents/design.md`): "How". Implementation details. Depends on SRS.
4. **Whiteboards** (`documents/whiteboards/<YYYY-MM-DD>-<slug>.md`): Temporary plans/notes. One file per task/session.

## Rules
- **STRICT COMPLIANCE**: AGENTS.md, SRS, SDS.
- **Workflow**: New/Updated req -> Update SRS -> Update SDS -> Implement.
- **Status**: `[x]` = implemented, `[ ]` = pending.
- **Evidence**: Every `[x]` acceptance criterion MUST include evidence — file
  paths with line numbers proving implementation. Format:
  `- [x] Criterion text. Evidence: \`path/to/file.ts:42\`, \`other/file.md:10\``
  Without evidence, criterion stays `[ ]`.

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
### 3.1 FR-1
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

- One file per task/session: `<YYYY-MM-DD>-<slug>.md` (kebab-case slug, ≤40 chars).
- Examples: `2026-03-24-add-dark-mode.md`, `2026-03-24-fix-auth-bug.md`.
- Do NOT reuse another session's whiteboard. Create a new file.
- Issue or plan in GODS format.
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

- **No History**: No changelogs.
- **English Only(Except whiteboards)**.
- **Summarize**: Extract facts -> compress. No loss of facts.
- **Essential Info**: No fluff. High-info words.
- **Compact**: Lists, tables, YAML, Mermaid.
- **Lexicon**: No stopwords. Short synonyms.
- **Entities**: Abbreviate after 1st use.
- **Direct**: No filler.
- **Structure**: Headings/sections.
- **Symbols**: Replace words with symbols/nums.
