---
name: flowai-init
description: Initialize project with AGENTS.md and rules, handling both Greenfield (new) and Brownfield (existing) projects.
disable-model-invocation: true
---

# Task: Initialize Project Agent Documentation

## Overview

Analyze the project, conduct an interview (for Greenfield projects), and
generate 3 AGENTS.md files (root, documents/, scripts/), a `CLAUDE.md` symlink
(for Claude Code compatibility), rules, and scaffolding.
The agent uses template files from `assets/` as reference and writes files directly.

## Context

<context>
The user wants to bootstrap an AI agent's understanding of the project. The agent needs to autonomously explore the codebase, recognize the technology stack, understand the directory structure, and infer key architectural patterns.
- **Greenfield (New Projects)**: Requires interviewing the user, creating scaffolding (`documents/`, configs), and setting up rules.
- **Brownfield (Existing Projects)**: Requires discovery, reverse-engineering architecture, and **extracting existing instructions** from `./AGENTS.md` into the appropriate subdirectory files.

**File Structure**: flowai-init produces 3 AGENTS.md files:
- `./AGENTS.md` - core agent rules, project metadata, planning rules, TDD flow
- `./documents/AGENTS.md` - documentation system rules (SRS/SDS/GODS formats, compressed style)
- `./scripts/AGENTS.md` - development commands (standard interface, detected commands)
</context>

## Rules & Constraints

<rules>
1. **No Hallucinations**: Only document tooling and architecture that is explicitly found in the codebase or provided by the user.
2. **Standard Format**: Generated files must follow the provided templates in `assets/`.
3. **Idempotency (Brownfield)**: If components already exist, show diffs and ask for per-file confirmation before applying changes.
4. **Greenfield/Brownfield Detection**: The agent determines project type autonomously by analyzing output of the analysis script (file count, stack, file tree, presence of config files). Do NOT rely on an `is_new` flag from any script.
5. **Scripts are read-only**: Analysis scripts must NOT create, write, or modify any files. All file creation is the agent's responsibility.
6. **No rule copying**: Do NOT copy rules to IDE-specific rules directories. Rule management is outside flowai-init scope.
7. **Mandatory**: The agent MUST use a task management tool (e.g., todo write) to track the execution steps.
8. **Per-File Diff Confirmation**: For existing files, always show the diff to the user and ask for confirmation before applying. Never silently overwrite.
9. **Preserve User Content**: In brownfield, extract and preserve user's existing instructions. Templates are fallbacks for greenfield only.
10. **Extract, Don't Duplicate**: In brownfield, if `./AGENTS.md` contains sections about documentation or development commands, these MUST be extracted into `./documents/AGENTS.md` and `./scripts/AGENTS.md` respectively, and REMOVED from `./AGENTS.md`.
</rules>

## Instructions

<step_by_step>

1. **Initialize**
   - Use a task management tool (e.g., todo write) to create a plan based on these steps.

2. **Analyze Project**
   - Run the analysis script to detect stack, inventory components, and verify setup:
     ```bash
     deno run --allow-read scripts/generate_agents.ts .
     ```
   - Read the JSON output. It wraps in `{ "ok": bool, "result": {...} }`. The `result` field contains: project metadata (`is_new`, `stack`, `file_tree`, `readme_content`), component `inventory`, and `verification` checks.
   - **Decision Point** (agent judgment, NOT a script flag):
     - Analyze file count, presence of source files, config files and existing documentation.
     - If project appears empty or minimal (no source files, no meaningful configs) -> treat as **Greenfield**.
     - If project has existing code, configs, or documentation -> treat as **Brownfield**.

3. **Greenfield Workflow (Interview)**
   - **Condition**: Only if **Greenfield**.
   - **Action**: Launch the `interviewer` subagent (or conduct Q&A inline if subagent unavailable).
     - **Prompt**: "You are helping initialize a new (Greenfield) project.
       Conduct a brief interview to gather:
       1. **Project Name**: Name?
       2. **Vision Statement**: What is the long-term goal and value?
       3. **Target Audience**: Who is this for?
       4. **Problem Statement**: What problem are we solving?
       5. **Solution & Differentiators**: How do we solve it and why is it better?
       6. **Risks & Assumptions**: What could go wrong?
       7. **Tech Stack**: Languages/Frameworks? (If not detected)
       8. **Architecture**: Patterns?
       9. **Key Decisions**: Tools/Methodologies?
       10. **Deno Tooling**: Do you want to build tooling around the project on Deno? (yes/no)
       11. **Devcontainer**: Would you like to set up a devcontainer for reproducible development environments? (yes/no)

       Return a SINGLE JSON object: {
       "project_name": "...",
       "vision_statement": "...",
       "target_audience": "...",
       "problem_statement": "...",
       "solution_differentiators": "...",
       "risks_assumptions": "...",
       "stack": ["..."],
       "architecture": "...",
       "key_decisions": "...",
       "preferences": ["tdd", "strict-mode", ...],
       "use_deno_tooling": boolean,
       "use_devcontainer": boolean
       }"

4. **Brownfield Workflow (Discovery & Extraction)**
   - **Condition**: Only if **Brownfield**.
   - **Action**: Analyze the project to infer architecture and key decisions.
     - Read key config files (`package.json`, `deno.json`, `README.md`, etc.).
     - Infer:
       - **Architecture**: (e.g., "React SPA", "Express API", "CLI Tool").
       - **Key Decisions**: (e.g., "Tailwind for styling", "Jest for testing").
   - **Extract from existing `./AGENTS.md`** (if it exists):
     - Read the entire file.
     - **Identify sections semantically**:
       - Sections about **documentation rules**, doc hierarchy, SRS/SDS formats, writing style, whiteboard -> these belong in `./documents/AGENTS.md`.
       - Sections about **development commands**, build scripts, test commands, detected commands -> these belong in `./scripts/AGENTS.md`.
       - Everything else (project identity, vision, architecture, planning rules, TDD, code docs, custom project rules) -> stays in `./AGENTS.md`.
     - Save extracted content for use in step 6.
     - **Important**: The extracted content from the user's existing file takes priority over template content. Templates are fallbacks only.

5. **Component Inventory**
   - Use the `inventory` section from the analysis output (step 2) to check which components exist.
   - Report findings to user as a checklist.
   - For **Brownfield**: ask "Create missing components? Update existing via diff? [create missing / update all / select]"

6. **Generate AGENTS.md Files**
   - Read template files from `assets/` directory:
     - `AGENTS.template.md` - reference for `./AGENTS.md`
     - `AGENTS.documents.template.md` - fallback for `./documents/AGENTS.md`
     - `AGENTS.scripts.template.md` - fallback for `./scripts/AGENTS.md`

   - **For Greenfield**: Fill templates with interview data. Replace `{{PLACEHOLDERS}}` with actual values.

   - **For Brownfield**:
     - `./AGENTS.md`: Use the template structure. Fill with data inferred from the project. Preserve user's custom project rules (content between `---` and the next `## ` heading). **Remove** any sections that were extracted for documents/ or scripts/.
     - `./documents/AGENTS.md`: Use **extracted documentation sections** from the existing `./AGENTS.md`. If no documentation sections were found, use `AGENTS.documents.template.md` as fallback.
     - `./scripts/AGENTS.md`: Use **extracted script/command sections** from the existing `./AGENTS.md`. If no command sections were found, use `AGENTS.scripts.template.md` as fallback, filling `{{DEVELOPMENT_COMMANDS}}` from detected stack and `{{COMMAND_SCRIPTS}}` from project config.

   - **For each file**:
     - If file does not exist: create it, report to user.
     - If file exists: show diff to user, ask for confirmation before writing.

7. **Claude Code Compatibility (CLAUDE.md Symlinks)**
   - Create relative symlinks `CLAUDE.md` -> `AGENTS.md` in **every directory** that has an `AGENTS.md`:
     - `./CLAUDE.md` -> `./AGENTS.md`
     - `./documents/CLAUDE.md` -> `./AGENTS.md`
     - `./scripts/CLAUDE.md` -> `./AGENTS.md`
   - For each symlink:
     - **If `CLAUDE.md` does not exist**: create the symlink, report to user.
     - **If `CLAUDE.md` exists and is already a correct symlink to `AGENTS.md`**: skip silently.
     - **If `CLAUDE.md` exists as a regular file or wrong symlink**: warn the user, show the current content/target, and ask for confirmation before replacing with the symlink.

8. **OpenCode Compatibility Check**
   - The `inventory` section from the analysis output (step 2) includes `opencode_json.exists` and `opencode_json.has_subdirectory_globs`.
   - If `opencode_json.exists` is `true` and `has_subdirectory_globs` is `false`: warn user and propose adding `documents/AGENTS.md` and `scripts/AGENTS.md` to the `instructions` array in `opencode.json`.

9. **Generate Documentation**
   - Generate core documentation files in `documents/`:
     - `documents/requirements.md` (SRS): Fill based on interview data (Greenfield) or inferred context (Brownfield). Skip if file exists and has more than 50 lines.
     - `documents/design.md` (SDS): Create initial structure. Skip if file exists and has more than 50 lines.
     - `documents/whiteboards/` directory:
       - For **Brownfield**: Create `documents/whiteboards/<YYYY-MM-DD>-init-context.md` with "Discovered Context" (file tree) and README summary.
       - For **Greenfield**: Directory will be created on first use by planning/answer skills. No need to initialize.
   - **Note**: Use LLM capabilities to generate high-quality, context-aware content from actual project data -- not empty placeholders.

10. **Configure Development Commands**
   - Read analysis output to get detected stack.
   - **Check Interview Data**: If `use_deno_tooling: true`, FORCE usage of `flowai-skill-configure-deno-commands`.
   - **Skill Lookup**: For each stack item, check if a specialized skill exists (e.g., `Deno` -> `flowai-skill-configure-deno-commands`).
   - If specialized skill exists: Read and follow its `SKILL.md`.
   - If NO specialized skill:
     1. Ask user for preferred scripting language (shell/python/stack-native).
     2. Analyze existing config files.
     3. Create standard command interface (`check`, `test`, `dev`, `prod`) in `scripts/`.
     4. Update project config (e.g., `package.json`) to reference these scripts.
   - **Skip condition**: If `scripts/` already exists with standard commands and user chose "create missing" -> skip.
   - **Verify**: Run `check` command to ensure it works.

11. **Devcontainer Setup (Optional)**
   - **For Greenfield**: Check `use_devcontainer` from interview data.
   - **For Brownfield**: Ask the user: "Would you like to set up a devcontainer for reproducible development environments?"
   - **If user declines**: Skip this step entirely.
   - **If user agrees**: Delegate to the `flowai-skill-setup-ai-ide-devcontainer` skill. Read and follow its `SKILL.md`.

12. **Cleanup & Verify**
    - Remove temporary files: `project_info.json`, `interview_data.json` (if created).
    - Re-run the analysis script to verify all components are in place:
      ```bash
      deno run --allow-read scripts/generate_agents.ts .
      ```
    - Check the `verification` section. If `passed` is false (exit code 1), fix the issues before proceeding.
    - Additionally verify: development commands are configured and the `check` command runs successfully.
    - **Verify no duplication**: Confirm that documentation/script sections are NOT present in both `./AGENTS.md` and their respective subdirectory files.

</step_by_step>

## Verification

<verification>
[ ] Analysis script run and output read.
[ ] Greenfield/Brownfield determined by agent judgment (not `is_new` flag).
[ ] Interview conducted (Greenfield) or discovery performed (Brownfield).
[ ] For Brownfield: documentation and script sections extracted from existing AGENTS.md.
[ ] For existing files: diffs shown and per-file confirmation requested.
[ ] Existing user content preserved (custom rules, extracted sections used as-is).
[ ] 3 AGENTS.md files generated: root, documents/, scripts/.
[ ] `CLAUDE.md` symlinks created in all directories with `AGENTS.md` (root, documents/, scripts/).
[ ] No duplication: sections moved to subdirectories are removed from root AGENTS.md.
[ ] `documents/` folder populated with generated content from actual project data.
[ ] Development commands configured (scripts created + config updated).
[ ] OpenCode compatibility checked (if applicable) via `inventory` output.
[ ] Analysis script re-run passes (exit code 0, `verification.passed: true`).
[ ] Check command runs successfully.
[ ] Devcontainer: user asked; if agreed, `.devcontainer/devcontainer.json` exists and is valid JSON.
[ ] Temporary files cleaned up.
</verification>
