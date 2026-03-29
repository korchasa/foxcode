---
name: flowai-skill-engineer-skill
description: Guide for creating effective Agent Skills (SKILL.md packages). Use when users want to create a new skill, write a skill, author a SKILL.md, or ask about skill structure, best practices, or skill file format. Works across IDEs (Cursor, Claude Code, OpenCode).
license: Based on https://github.com/anthropics/skills
---

# Skill Creator

This skill guides through creating effective Agent Skills - markdown-based packages that teach AI agents specialized workflows, domain knowledge, and procedural capabilities.

## About Skills

Skills are self-contained packages (directory with `SKILL.md`) that extend agent capabilities with:

1. **Specialized workflows** - multi-step procedures for specific domains
2. **Tool integrations** - instructions for working with specific file formats or APIs
3. **Domain expertise** - company-specific knowledge, schemas, business logic
4. **Bundled resources** - scripts, references, and assets for complex tasks

## IDE Detection and Skill Placement

Skills work across multiple IDEs. Before creating a skill, determine the current environment and ask the user where to place it.

### Control Primitives Map by IDE

| Primitive | Scope | Claude Code | Cursor | OpenCode |
| :--- | :--- | :--- | :--- | :--- |
| **Persistent Instructions** | User | `~/.claude/CLAUDE.md` | - | `~/.config/opencode/AGENTS.md`<br>`~/.claude/CLAUDE.md` (fallback) |
| | Project | `CLAUDE.md`<br>`.claude/rules/*.md` | `AGENTS.md`<br>`.cursor/rules/*/RULE.md`<br>~~`.cursor/rules/*.mdc`~~ | `AGENTS.md`<br>`CLAUDE.md` (fallback)<br>`opencode.json` `instructions` |
| | Folder | `subdir/CLAUDE.md`<br>`CLAUDE.local.md` | `subdir/AGENTS.md` | - |
| **Conditional Instructions** | Project | `.claude/rules/*.md` | `.cursor/rules/*/RULE.md`<br>~~`.cursor/rules/*.mdc`~~ | `opencode.json` `instructions` (globs) |
| **Custom Commands** | User | `~/.claude/commands/*.md` | `~/.cursor/commands/*.md` | `~/.config/opencode/commands/*.md` |
| | Project | `.claude/commands/*.md`<br>`.claude/commands/<namespace>/*.md` | `.cursor/commands/*.md` | `.opencode/commands/*.md` |
| **Skills** | User | `~/.claude/skills/<name>/` | `~/.cursor/skills/<name>/` | `~/.config/opencode/skills/<name>/`<br>`~/.claude/skills/<name>/` (fallback) |
| | Project | `.claude/skills/<name>/` | `.cursor/skills/<name>/` | `.opencode/skills/<name>/`<br>`.claude/skills/<name>/` (fallback) |
| **Event Hooks** | User | `~/.claude/settings.json` | `~/.cursor/hooks.json` | `~/.config/opencode/plugins/*.{js,ts}` |
| | Project | `.claude/settings.json`<br>`.claude/settings.local.json` | `.cursor/hooks.json` | `.opencode/plugins/*.{js,ts}` |
| **MCP Integration** | User | `settings.json`<br>`managed-mcp.json` | `~/.cursor/mcp.json` | `opencode.json` `mcp` |
| | Project | `.mcp.json` | `.cursor/mcp.json` | `opencode.json` `mcp` |
| **Context Ignoring** | User | `.claude/settings.json` | - | - |
| | Project | - | `.cursorignore` | `.gitignore`<br>`.ignore`<br>`opencode.json` `watcher.ignore` |

### Skill-Specific Paths

| IDE | Personal Skills | Project Skills |
|-----|----------------|----------------|
| **Cursor** | `~/.cursor/skills/<name>/` | `.cursor/skills/<name>/` |
| **Claude Code** | `~/.claude/skills/<name>/` | `.claude/skills/<name>/` |
| **OpenCode** | `~/.config/opencode/skills/<name>/` | `.opencode/skills/<name>/` |

OpenCode also reads skills from fallback locations: `.claude/skills/`, `.agents/skills/`, `~/.claude/skills/`, `~/.agents/skills/`.

### Detection Strategy

1. Check for IDE-specific markers in the project:
   - `.cursor/` directory -> Cursor
   - `.claude/` directory -> Claude Code
   - `.opencode/` directory or `opencode.json` -> OpenCode
2. If multiple detected or none -> ask the user
3. Ask: personal skill (user-level) or project skill (shared via repo)?

**IMPORTANT**: Never create skills in `~/.cursor/skills-cursor/` - reserved for Cursor internals.

## Core Principles

### Concise is Key

Context window is shared with conversation, other skills, and user request. Every token competes for space.

**Default assumption: the agent is already very smart.** Only add context it doesn't already have.

Challenge each piece:
- "Does the agent really need this explanation?"
- "Does this paragraph justify its token cost?"

Prefer concise examples over verbose explanations.

### Set Appropriate Degrees of Freedom

| Freedom Level | When to Use | Example |
|---------------|-------------|---------|
| **High** (text instructions) | Multiple valid approaches, context-dependent | Code review guidelines |
| **Medium** (pseudocode/templates) | Preferred pattern with acceptable variation | Report generation |
| **Low** (specific scripts) | Fragile operations, consistency critical | Database migrations |

### Anatomy of a Skill

Every skill: required `SKILL.md` + optional bundled resources in a directory:

```
skill-name/
├── SKILL.md              # Required - main instructions
├── references/           # Optional - detailed documentation
│   ├── api_reference.md
│   └── patterns.md
├── scripts/              # Optional - executable code
│   └── validate.py
└── assets/               # Optional - output resources
    └── template.md
```

#### SKILL.md (required)

- **Frontmatter** (YAML): `name` and `description` fields. These determine when the skill triggers.
- **Body** (Markdown): Instructions loaded AFTER skill triggers.

#### Bundled Resources (optional)

| Type | Path | Purpose | When to Include |
|------|------|---------|-----------------|
| **Scripts** | `scripts/` | Executable code (Python/Bash) | Same code rewritten repeatedly; deterministic reliability needed |
| **References** | `references/` | Documentation loaded into context as needed | Detailed info too lengthy for SKILL.md |
| **Assets** | `assets/` | Files used in output (templates, images, fonts) | Templates, boilerplate, images for final output |

#### What NOT to Include

No README.md, CHANGELOG.md, INSTALLATION_GUIDE.md, or other auxiliary docs. The skill contains only what the agent needs to do the job.

### Progressive Disclosure

Three-level loading to manage context:

1. **Metadata** (name + description) - always in context (~100 words)
2. **SKILL.md body** - when skill triggers (<5k words)
3. **Bundled resources** - as needed (unlimited)

Keep SKILL.md under 500 lines. Split content into separate files when approaching this limit. Reference them clearly from SKILL.md with guidance on when to read them.

**Important**: Keep references one level deep from SKILL.md. Avoid deeply nested chains.

## Writing Effective Descriptions

Description is critical for skill discovery. The agent uses it to decide when to apply the skill.

### Rules

1. **Third person** (injected into system prompt):
   - Good: "Processes Excel files and generates reports"
   - Bad: "I can help you process Excel files"

2. **Specific with trigger terms**:
   - Good: "Extract text/tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction."
   - Bad: "Helps with documents"

3. **Include WHAT and WHEN**:
   - WHAT: specific capabilities
   - WHEN: trigger scenarios

### Constraints

| Field | Limit |
|-------|-------|
| `name` | Max 64 chars, `[a-z0-9-]` only, no leading/trailing/consecutive hyphens |
| `description` | Max 1024 chars, no angle brackets `<>` |

## Common Patterns

### Template Pattern

Provide output format templates when consistent structure matters:

```markdown
## Report structure
ALWAYS use this template:
# [Title]
## Executive summary
[One-paragraph overview]
## Key findings
- Finding 1 with data
## Recommendations
1. Specific action
```

### Examples Pattern

For output quality dependent on seeing examples:

```markdown
## Commit message format
**Example 1:**
Input: Added user authentication with JWT tokens
Output: feat(auth): implement JWT-based authentication
```

### Workflow Pattern

Break complex operations into steps with checklists:

```markdown
## Workflow
- [ ] Step 1: Analyze input
- [ ] Step 2: Create mapping
- [ ] Step 3: Validate
- [ ] Step 4: Execute
- [ ] Step 5: Verify
```

### Conditional Workflow Pattern

Guide through decision points:

```markdown
1. Determine type:
   **Creating new?** -> "Creation workflow" below
   **Editing existing?** -> "Editing workflow" below
```

### Feedback Loop Pattern

For quality-critical tasks:

```markdown
1. Make edits
2. Validate: `deno run scripts/validate_skill.ts output/`
3. If fails -> fix -> validate again
4. Only proceed when validation passes
```

## Anti-Patterns

- **Windows paths**: Use `scripts/helper.py`, not `scripts\helper.py`
- **Too many options**: Provide a default with escape hatch, not a buffet
- **Time-sensitive info**: Use "Current method" / "Old patterns (deprecated)" sections
- **Inconsistent terminology**: Pick one term, use throughout
- **Vague names**: `code-review` not `helper` or `utils`

## Skill Creation Process

### Phase 1: Discovery

Gather from user:
1. Purpose and primary use case
2. Target IDE and storage location (personal vs project)
3. Trigger scenarios (when should agent apply this?)
4. Domain knowledge the agent lacks
5. Output format preferences
6. Existing patterns to follow

If context from prior conversation exists, infer the skill from discussed workflows/patterns.

### Phase 2: Design

1. Draft skill name (lowercase, hyphens, max 64 chars)
2. Write specific, third-person description with WHAT + WHEN
3. Outline main sections
4. Identify supporting files needed (references, scripts, assets)

### Phase 3: Implementation

1. Create directory structure
2. Write SKILL.md with frontmatter
3. Create supporting reference files
4. Create utility scripts if needed
5. Run `deno run -A scripts/init_skill.ts` for scaffolding if starting from scratch

### Phase 4: Verification

Run validation:

```bash
deno run -A scripts/validate_skill.ts <path/to/skill-directory>
```

Checklist:
- [ ] SKILL.md under 500 lines
- [ ] Description is specific, includes trigger terms, WHAT + WHEN
- [ ] Written in third person
- [ ] Consistent terminology
- [ ] File references one level deep
- [ ] No time-sensitive information
- [ ] No auxiliary docs (README, CHANGELOG)
- [ ] Examples are concrete, not abstract

### Phase 5: Packaging

```bash
deno run -A scripts/package_skill.ts <path/to/skill-directory> [output-directory]
```

Creates a `.skill` zip file for distribution.

### Phase 6: Iterate

1. Use skill on real tasks
2. Notice struggles or inefficiencies
3. Update SKILL.md or bundled resources
4. Test again

## Design Patterns Reference

- **Multi-step processes**: See [references/workflows.md](references/workflows.md)
- **Output formats and quality standards**: See [references/output-patterns.md](references/output-patterns.md)
