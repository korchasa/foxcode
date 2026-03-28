import { BenchmarkSkillScenario } from "@bench/types.ts";

export const EngineerSubagentBasicBench = new class
  extends BenchmarkSkillScenario {
  id = "flowai-skill-engineer-subagent-basic";
  name = "Create a code reviewer subagent for a Cursor project";
  skill = "flowai-skill-engineer-subagent";
  agentsTemplateVars = {
    PROJECT_NAME: "TestProject",
    TOOLING_STACK: "- TypeScript\n- Deno",
  };

  // NOTE: Uses Cursor (.cursor/) instead of Claude Code (.claude/) because
  // Claude Code CLI blocks Write tool to .claude/ even in bypassPermissions mode.
  userQuery =
    "/flowai-skill-engineer-subagent Create a subagent that acts as a security-focused code reviewer. It should proactively check for hardcoded secrets, SQL injection, XSS vulnerabilities, and insecure dependencies. This is a Cursor project, place it at project level.";

  checklist = [
    {
      id: "detects_ide",
      description:
        "Did the agent detect Cursor as the target IDE (via .cursor/ directory) or acknowledge the user's specification?",
      critical: true,
    },
    {
      id: "correct_file_location",
      description:
        "Did the agent create the subagent file in the correct location (.cursor/agents/*.md)?",
      critical: true,
    },
    {
      id: "valid_frontmatter",
      description:
        "Does the subagent file have valid YAML frontmatter with name and description fields?",
      critical: true,
    },
    {
      id: "description_third_person",
      description:
        "Is the description written in third person with specific trigger terms and includes WHAT + WHEN?",
      critical: true,
    },
    {
      id: "focused_specialization",
      description:
        "Is the subagent focused on one specific task (security review) rather than being overly broad?",
      critical: true,
    },
    {
      id: "has_workflow",
      description:
        "Does the system prompt body define a clear workflow or checklist for how the subagent should operate?",
      critical: true,
    },
    {
      id: "security_concerns_covered",
      description:
        "Does the subagent address the requested security concerns (secrets, SQL injection, XSS, insecure deps)?",
      critical: false,
    },
  ];

  override setup(sandboxDir: string): Promise<void> {
    // Create .cursor directory marker so agent detects Cursor
    Deno.mkdirSync(`${sandboxDir}/.cursor/agents`, { recursive: true });
    return Promise.resolve();
  }
}();
