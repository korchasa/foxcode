import { BenchmarkSkillScenario } from "@bench/types.ts";

export const WriteAgentBenchmarksBasicBench = new class
  extends BenchmarkSkillScenario {
  id = "flowai-skill-write-agent-benchmarks-basic";
  name = "Create Benchmark Scenario for a Skill";
  skill = "flowai-skill-write-agent-benchmarks";
  stepTimeoutMs = 180_000;
  agentsTemplateVars = {
    PROJECT_NAME: "BenchmarkExample",
    TOOLING_STACK: "- TypeScript\n- Deno",
  };

  userQuery =
    '/flowai-skill-write-agent-benchmarks Create a benchmark scenario for the skill "flowai-skill-example" that tests whether the agent can rename a variable across all files in a project. The skill is at framework/skills/flowai-skill-example/SKILL.md.';

  override setup(sandboxDir: string): Promise<void> {
    // Create a minimal skill SKILL.md so the agent has something to reference
    Deno.mkdirSync(`${sandboxDir}/framework/skills/flowai-skill-example`, {
      recursive: true,
    });
    Deno.writeTextFileSync(
      `${sandboxDir}/framework/skills/flowai-skill-example/SKILL.md`,
      [
        "---",
        "name: flowai-skill-example",
        "description: Example skill for renaming variables across a codebase",
        "---",
        "",
        "# Variable Renaming Skill",
        "",
        "Renames a variable across all files in the project.",
      ].join("\n"),
    );
    // Create the benchmark lib types so the agent can import from it
    Deno.mkdirSync(`${sandboxDir}/scripts/benchmarks/lib`, {
      recursive: true,
    });
    Deno.writeTextFileSync(
      `${sandboxDir}/scripts/benchmarks/lib/types.ts`,
      [
        "export interface BenchmarkChecklistItem {",
        "  id: string;",
        "  description: string;",
        "  critical: boolean;",
        '  type?: "static" | "semantic";',
        "}",
        "",
        "export interface BenchmarkScenario {",
        "  id: string;",
        "  name: string;",
        "  targetAgentPath?: string;",
        "  skill?: string;",
        "  setup: (sandboxPath: string) => Promise<void>;",
        "  fixturePath?: string;",
        "  userQuery: string;",
        "  checklist: BenchmarkChecklistItem[];",
        "  mocks?: Record<string, string>;",
        "  maxSteps?: number;",
        "  stepTimeoutMs?: number;",
        "  userPersona?: string;",
        "  interactive?: boolean;",
        "  agentsTemplateVars: {",
        "    PROJECT_NAME: string;",
        "    PROJECT_RULES?: string;",
        "    PROJECT_VISION?: string;",
        "    TOOLING_STACK?: string;",
        "    ARCHITECTURE?: string;",
        "    KEY_DECISIONS?: string;",
        "    generateDocuments?: boolean;",
        "    scripts?: { DEVELOPMENT_COMMANDS?: string; COMMAND_SCRIPTS?: string; };",
        "  };",
        "}",
        "",
        "export abstract class BenchmarkSkillScenario implements BenchmarkScenario {",
        "  abstract id: string;",
        "  abstract name: string;",
        "  abstract skill: string;",
        "  abstract userQuery: string;",
        "  abstract checklist: BenchmarkChecklistItem[];",
        "  abstract agentsTemplateVars: BenchmarkScenario['agentsTemplateVars'];",
        "  get targetAgentPath(): string {",
        "    return `framework/skills/${this.skill}/SKILL.md`;",
        "  }",
        "  setup(_sandboxPath: string): Promise<void> {",
        "    return Promise.resolve();",
        "  }",
        "}",
      ].join("\n"),
    );
    return Promise.resolve();
  }

  maxSteps = 20;

  checklist = [
    {
      id: "scenario_file_created",
      description:
        "Did the agent create a benchmark scenario file at 'framework/skills/flowai-skill-example/benchmarks/*/mod.ts'?",
      critical: true,
    },
    {
      id: "extends_base_class",
      description: "Does the scenario class extend BenchmarkSkillScenario?",
      critical: true,
    },
    {
      id: "has_checklist",
      description:
        "Does the scenario define a checklist with at least 2 items, including at least one critical check?",
      critical: true,
    },
    {
      id: "has_user_query",
      description:
        "Does the scenario have a realistic userQuery that describes the task?",
      critical: true,
    },
    {
      id: "has_setup_or_fixture",
      description:
        "Does the scenario include either an override setup() method or a fixture directory with test files?",
      critical: true,
    },
    {
      id: "evidence_based_checks",
      description:
        "Are the checklist items evidence-based (verifying artifacts/state) rather than trusting agent claims?",
      critical: false,
    },
  ];
}();
