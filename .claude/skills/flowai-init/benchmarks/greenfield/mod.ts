import { join } from "@std/path";
import { BenchmarkSkillScenario } from "@bench/types.ts";

export const InitGreenfieldBench = new class extends BenchmarkSkillScenario {
  id = "flowai-init-greenfield";
  name = "Init Greenfield Project with Interview";
  skill = "flowai-init";
  stepTimeoutMs = 600_000;
  interactive = true;
  maxSteps = 20;
  agentsTemplateVars = {
    PROJECT_NAME: "InitTestProject",
  };

  override async setup(sandboxPath: string) {
    await Deno.mkdir(join(sandboxPath, "documents"), { recursive: true });
    // Empty directory for greenfield
  }

  userQuery = "/flowai-init";

  userPersona = `You are a developer starting a new project called 'MyProject'.
Your vision is 'World domination'. 
Target audience is 'Everyone'. 
The problem is 'Boredom' and the solution is 'Fun'. 
There are no major risks. 
The tech stack is 'Deno' and 'TypeScript'. 
The architecture is 'Monolith'. 
When the agent asks for project details or starts an interview, provide these details. 
Always confirm when asked to overwrite or create files.
Always confirm when asked to apply diffs.`;

  checklist = [
    {
      id: "interview_started",
      description:
        "Did the agent start an interview to gather project details?",
      critical: true,
    },
    {
      id: "agents_md_created",
      description:
        "Was AGENTS.md created after the interview (simulated or actual)?",
      critical: true,
    },
    {
      id: "documents_agents_md_created",
      description:
        "Was documents/AGENTS.md created with documentation rules (SRS/SDS formats, compressed style)?",
      critical: true,
    },
    {
      id: "scripts_agents_md_created",
      description: "Was scripts/AGENTS.md created with development commands?",
      critical: true,
    },
    {
      id: "doc_rules_present",
      description:
        "Does documents/AGENTS.md contain 'Documentation Rules' or 'DOCS STRUCTURE'?",
      critical: true,
    },
    {
      id: "dev_commands_configured",
      description:
        "Were development commands configured with real scripts (not just stub echo commands)?",
      critical: false,
    },
  ];
}();
