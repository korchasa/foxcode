import { BenchmarkSkillScenario } from "@bench/types.ts";

export const EngineerHookClaudeCodeBench = new class
  extends BenchmarkSkillScenario {
  id = "flowai-skill-engineer-hook-claude-code";
  name = "Create Claude Code Hook for Dangerous Command Blocking";
  skill = "flowai-skill-engineer-hook";
  stepTimeoutMs = 300_000;
  agentsTemplateVars = {
    PROJECT_NAME: "TestProject",
    TOOLING_STACK: "- TypeScript\n- Deno",
  };

  userQuery =
    '/flowai-skill-engineer-hook Create a hook that blocks "rm -rf" commands before they execute. This is a Claude Code project.';

  checklist = [
    {
      id: "detects_claude_code",
      description:
        "Did the agent detect or acknowledge Claude Code as the target IDE (via .claude/ directory presence)?",
      critical: true,
    },
    {
      id: "settings_json_format",
      description:
        "Did the agent create or show a settings.json with the correct nested Claude Code hook structure: hooks.PreToolUse[].matcher + hooks[] array?",
      critical: true,
    },
    {
      id: "correct_event",
      description:
        'Did the agent use PreToolUse event with matcher "Bash" (not a Cursor event name like beforeShellExecution)?',
      critical: true,
    },
    {
      id: "script_created",
      description:
        "Did the agent create a shell script that reads JSON from stdin and uses exit code 2 to block (Claude Code convention)?",
      critical: false,
    },
  ];

  override setup(sandboxDir: string): Promise<void> {
    // Create .claude directory marker so agent detects Claude Code
    Deno.mkdirSync(`${sandboxDir}/.claude`, { recursive: true });
    Deno.writeTextFileSync(
      `${sandboxDir}/.claude/settings.json`,
      "{}",
    );
    return Promise.resolve();
  }
}();
