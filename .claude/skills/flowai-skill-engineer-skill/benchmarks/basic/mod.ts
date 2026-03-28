import { BenchmarkSkillScenario } from "@bench/types.ts";

export const EngineerSkillBasicBench = new class
  extends BenchmarkSkillScenario {
  id = "flowai-skill-engineer-skill-basic";
  name = "Create a skill for generating database migration files";
  skill = "flowai-skill-engineer-skill";
  agentsTemplateVars = {
    PROJECT_NAME: "TestProject",
    TOOLING_STACK: "- TypeScript\n- Deno",
  };

  // NOTE: Uses Cursor (.cursor/) instead of Claude Code (.claude/) because
  // Claude Code CLI blocks Write tool to .claude/ even in bypassPermissions mode.
  userQuery =
    "/flowai-skill-engineer-skill Create a skill that helps generate database migration files for PostgreSQL. It should guide through creating up/down migrations with proper naming conventions (timestamp-based), handle common patterns like adding columns, creating tables, and adding indexes. Place it as a project skill for Cursor.";

  interactive = true;
  userPersona =
    "A backend developer who wants a skill for database migrations. When asked about IDE, answer Cursor. When asked about scope, answer project-level. Keep answers brief.";

  checklist = [
    {
      id: "skill_md_created",
      description:
        "Did the agent create a SKILL.md file in the correct location (e.g., .cursor/skills/<name>/SKILL.md)?",
      critical: true,
    },
    {
      id: "valid_frontmatter",
      description:
        "Does the SKILL.md have valid YAML frontmatter with name (lowercase hyphenated, max 64 chars) and description fields?",
      critical: true,
    },
    {
      id: "description_quality",
      description:
        "Is the description written in third person, includes WHAT the skill does and WHEN to use it, and contains specific trigger terms (e.g., migration, database, PostgreSQL)?",
      critical: true,
    },
    {
      id: "actionable_content",
      description:
        "Does the SKILL.md body contain actionable workflow steps or templates for generating migrations (not just abstract advice)?",
      critical: true,
    },
    {
      id: "under_500_lines",
      description: "Is the SKILL.md under 500 lines?",
      critical: true,
    },
    {
      id: "no_auxiliary_docs",
      description:
        "Did the agent avoid creating unnecessary auxiliary files (README.md, CHANGELOG.md)?",
      critical: false,
    },
  ];

  override setup(sandboxDir: string): Promise<void> {
    // Create .cursor directory marker so agent detects Cursor
    Deno.mkdirSync(`${sandboxDir}/.cursor/skills`, { recursive: true });
    return Promise.resolve();
  }
}();
