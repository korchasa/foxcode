---
name: flow-skill-engineer-pipeline
description: "Guide for creating custom SDLC pipelines with orchestrator skills and role-specific subagents"
---

# Engineering Guide: Custom Pipelines

This skill documents the orchestration pattern for building automated
multi-agent pipelines. Use it as a reference when creating your own
pipelines beyond the standard SDLC flow.

## Core Pattern

A pipeline consists of:
1. **Orchestrator skill** — a SKILL.md that manages step sequence, resume logic, and external integrations (issue trackers, CI/CD)
2. **Role-specific subagents** — agents with isolated context, restricted permissions, and structured output
3. **Artifacts** — markdown files with YAML frontmatter produced by each step
4. **Validation hooks** — PostToolUse hooks that validate artifact structure

## Orchestrator Skill Structure

```markdown
---
name: my-pipeline
description: "Pipeline description"
user-invocable: true
---

# Pipeline Name

## Initialization
- Generate run_id (timestamp)
- Create run directory: .flow/runs/<run_id>/

## Variables
- run_id, run_dir, max_iterations

## Step N: <Phase Name> (<Agent Role>)

**Resume check:** If <artifact> exists and is valid, SKIP.

Launch subagent:
  Agent(subagent_type: "my-agent", prompt: "...")

## Error Handling
- Subagent failure -> rollback + review
- Hook blocks -> subagent self-corrects

## Resume
- Check artifact existence before each step
- Find latest run: ls -1 .flow/runs/ | sort | tail -1
```

### Key Principles

- **Resume via artifacts:** Each step checks if its output exists before running. This enables `--resume` without state tracking.
- **Steps section:** Each step has a resume check, an agent launch, and optional post-step actions.
- **External integrations centralized:** All issue tracker / CI / notification commands live in the orchestrator, NOT in subagents. This makes it trivial to swap GitHub for Jira/Linear/Slack.

## Subagent Design

### Thin Wrappers Over Core Skills

Subagents should NOT contain full implementation logic. Instead:
1. **Isolate context** — each step gets a clean context window
2. **Reference core skills** — e.g., `flowai-plan`, `flowai-review`
3. **Add restrictions** — Permissions (bash whitelist, file access), Output Schema

### Required Sections (Pack Convention)

```markdown
## Permissions
- Bash whitelist: [<allowed commands>]
- Allowed files: [<patterns>]
- Denied files: [<patterns>]

## Output Schema
- Format: markdown with YAML frontmatter
- Required fields: [<field list>]
```

These sections are validated by the `validate-agent-structure` hook.

### Comment Identification

Each agent uses a prefix for traceability in multi-agent output:
```
**[<Role> · <action>]** <message>
```
Examples: `[PM · specify]`, `[QA · verify]`, `[Developer · implement]`

## Artifact Validation

Each artifact type has a schema (filename pattern -> required YAML frontmatter fields).
The `validate-artifact` hook checks these automatically after Write/Edit.

Define schemas in the hook:
```typescript
const ARTIFACT_SCHEMAS: Record<string, string[]> = {
  "01-spec.md": ["issue", "scope"],
  "03-decision.md": ["variant", "tasks"],
  "05-qa-report.md": ["verdict", "high_confidence_issues"],
};
```

## Reflection Memory

For pipelines that run repeatedly, add reflection memory:
- **Memory** (`.flow/memory/<agent>.md`): Edit-in-place snapshot, <=50 lines
- **History** (`.flow/memory/<agent>-history.md`): Append-only log, <=20 entries
- **Lifecycle:** orchestrator calls reflection read before subagent, reflection write after

See the automation pack's reflection protocol agent for the full protocol.

## HITL (Human-in-the-Loop)

When a subagent needs human input:
1. Subagent writes question to `<node_dir>/hitl-question.txt`
2. Orchestrator detects the file and posts question to issue tracker
3. Orchestrator polls for reply using `hitl-check.ts` script
4. Orchestrator passes reply back to subagent

This keeps subagents agnostic to the communication channel.

## Implementation Loop Pattern

For iterative steps (e.g., Developer + QA):
```
for iter in 1..max_iterations:
  launch Developer(prev_qa_report if iter > 1)
  launch QA
  if QA.verdict == PASS: break
if all iterations FAIL: rollback
```

## Example: Standard SDLC Pipeline

See the automation pack's SDLC pipeline skill for a complete
reference implementation with 6 roles:
- PM -> Architect -> Tech Lead -> Developer + QA (loop <=3) -> Review
