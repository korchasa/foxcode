---
name: flowai-answer
description: >-
  Analyze and answer user questions in Autonomous Mode by reading documentation
  and inspecting codebase
disable-model-invocation: true
---

# Task Answer

## Overview

Analyze and answer a user's question in Autonomous Mode by carefully reading
documentation and inspecting the codebase. For large responses, save detailed
analysis to a file in `documents/whiteboards/`.

## Context

<context>
The user has a question about the project's logic, architecture, or implementation. The project uses a structured documentation system in `./documents` and follows specific design patterns.
</context>

## Rules & Constraints

<rules>
1. **Language Policy**:
   - Code, technical terms, and quotes from codebase: **English**.
   - Analysis, explanations, and chat responses: **User's Query Language**.
2. **Read-Only Mode**:
   - Keep all repository files unchanged (except files in `documents/whiteboards/`).
   - Use tools in read-only mode (reading files, searching code).
   - **DO NOT** modify project configuration or code.
3. **Accuracy**: Cross-check implementation against requirements and design to identify matches, gaps, or inconsistencies.
4. **Planning**: The agent MUST use a task management tool (e.g., todo write) to track the execution steps.
</rules>

## Instructions

<step_by_step>

1. **Initialize**
   - Use a task management tool (e.g., todo write) to create a plan based on these steps.
2. **Understand the question**
   - Read all available docs in `./documents` (SRS, SDS, file structure,
     manuals, whiteboards) if they exist.
   - Clarify and restate the user's question in a more precise and structured
     form.
   - Ask the user follow-up questions if the task, constraints, or expected
     output are not fully clear.
   - Explicitly list assumptions, missing details, and the intended scope of the
     answer.
3. **Documentation-based analysis**
   - Map the question to relevant requirements in `documents/requirements.md`
     (SRS).
   - Map the question to relevant design decisions in `documents/design.md`
     (SDS).
   - Consider architecture, constraints, and interfaces described in the
     documentation.
4. **Code analysis**
   - Locate relevant files, modules, and functions in the codebase.
   - Read and understand current implementation and its behavior in the context
     of the question.
   - Identify matches, gaps, or inconsistencies between implementation and
     documentation.
5. **Answer synthesis**
   - Explain how the existing code and design relate to the question and
     requirements.
   - Highlight limitations, edge cases, and potential improvements where
     relevant.
   - If critical uncertainties remain, clearly state them and ask for input
     instead of guessing.
   - For large responses (>1000 characters), save detailed analysis to
     `documents/whiteboards/<YYYY-MM-DD>-<slug>.md` and provide summary in chat. </step_by_step>

## Verification

<verification>
- [ ] Documentation read (where available) and question clarified.
- [ ] Necessary clarification questions asked to the user (if needed).
- [ ] Relevant code located and analyzed.
- [ ] Answer formulated and structured.
- [ ] Response saved to `documents/whiteboards/` if large, otherwise provided directly.
</verification>
