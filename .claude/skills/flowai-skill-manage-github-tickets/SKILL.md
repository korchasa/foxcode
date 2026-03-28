---
name: flowai-skill-manage-github-tickets
description: Create and manage GitHub issues using the GODS framework. Use when creating, updating, or triaging GitHub issues.
---

# Manage GitHub Tickets

## Overview

Create and manage GitHub issues formatted with the GODS framework. Use whatever
GitHub tool is available in your environment.

## Instructions

<step_by_step>

1. **Detect Tool**
   - Check what GitHub tools are available. Prefer in order:
     - MCP tools (`create_issue`, `update_issue`, `list_issues`, etc.)
     - `gh` CLI (`gh issue create`, `gh issue edit`, etc.)
   - If no tool is available, compose the issue body and show it to the user
     for manual creation.

2. **Compose Issue in GODS Format**
   - All tickets MUST follow the GODS framework (see `flowai-skill-write-gods-tasks`).
   - All tickets and messages MUST be in English.
   - Structure:
     - **Goal**: Why? Business value.
     - **Overview**: What happened? Context, pain points, environment.
     - **Definition of Done**: Measurable completion criteria.
     - **Solution**: Actionable steps (optional if executor chooses approach).

3. **Create/Update Issue**
   - Use the detected tool to create or update the issue.
   - If using `gh` CLI: `gh issue create --title "..." --body "..."`.
   - If using MCP: call `create_issue` or `update_issue`.
   - If no tool: output the formatted issue body for the user.

4. **Verify**
   - Confirm the issue was created (URL or issue number).
   - If creation failed, show the error and the composed body so user can
     create manually.

</step_by_step>

## GODS Framework Summary

- **Goal**: Why are we performing the task? What is the business goal?
- **Overview**: What is happening now? Why did the task arise? What is the context?
- **Definition of Done**: When do we consider the task completed? By what criteria?
- **Solution**: How can the task be solved?

## Where GODS Works Best

Ideal for: incidents, operational DevOps tasks, infrastructure development,
product team requests, business processes with clear outcomes.

Not effective for: innovative projects without clear outcomes, tasks with
rapidly changing requirements.

## Example

```markdown
**Goal:** Restore the CI/CD pipeline so deployment delays do not exceed 1 hour.

**Overview:** Updated Jenkins plugin → 5 builds with errors → version incompatible.

**Definition of Done:** All builds pass without errors within a day, tests ≥98% successful, team notified.

**Solution:** Roll back the plugin, patch, or change the tool after log analysis.
```

For more examples, see `flowai-skill-write-gods-tasks`.
