import { BenchmarkSkillScenario } from "@bench/types.ts";

export const EngineerRuleConditionalBench = new class
  extends BenchmarkSkillScenario {
  id = "flowai-skill-engineer-rule-conditional";
  name = "Create a conditional TypeScript error handling rule";
  skill = "flowai-skill-engineer-rule";
  agentsTemplateVars = {
    PROJECT_NAME: "TestProject",
    TOOLING_STACK: "- TypeScript\n- Deno",
  };

  userQuery =
    "/flowai-skill-engineer-rule Create a rule that enforces typed error handling in TypeScript files: always use custom error classes, never catch without re-throwing or logging, and always include error context. This should only apply to .ts files.";

  checklist = [
    {
      id: "detects_ide",
      description:
        "Did the agent detect the target IDE (via .claude/ directory) or ask the user which IDE to target?",
      critical: true,
    },
    {
      id: "correct_file_location",
      description:
        "Did the agent create the rule file in a correct IDE-specific location (e.g., .claude/rules/*.md, .cursor/rules/*/RULE.md)?",
      critical: true,
    },
    {
      id: "has_frontmatter",
      description:
        "Does the rule file have valid YAML frontmatter with description and file pattern fields (globs or paths)?",
      critical: true,
    },
    {
      id: "conditional_scope",
      description:
        "Is the rule scoped to TypeScript files (e.g., globs: '**/*.ts' or paths: '**/*.ts'), not always-apply?",
      critical: true,
    },
    {
      id: "includes_code_examples",
      description:
        "Does the rule include concrete code examples showing good and bad error handling patterns?",
      critical: true,
    },
    {
      id: "concise_content",
      description:
        "Is the rule content concise and actionable (under 500 lines, preferably under 50)?",
      critical: false,
    },
  ];

  override setup(sandboxDir: string): Promise<void> {
    // Create .claude directory marker so agent can detect Claude Code
    Deno.mkdirSync(`${sandboxDir}/.claude`, { recursive: true });
    return Promise.resolve();
  }
}();
