import { BenchmarkSkillScenario } from "@bench/types.ts";

export const DrawMermaidSequenceBench = new class
  extends BenchmarkSkillScenario {
  id = "flowai-skill-draw-mermaid-diagrams-sequence";
  name = "Create a Mermaid sequence diagram for an API auth flow";
  skill = "flowai-skill-draw-mermaid-diagrams";
  agentsTemplateVars = {
    PROJECT_NAME: "AuthService",
  };

  userQuery =
    "/flowai-skill-draw-mermaid-diagrams Create a sequence diagram showing an OAuth2 authorization code flow between a User, Browser, Auth Server, and Resource Server. Include the redirect, token exchange, and API call with the access token. Save it to docs/auth-flow.md.";

  checklist = [
    {
      id: "correct_diagram_type",
      description:
        "Did the agent create a sequenceDiagram (not a flowchart or other type)?",
      critical: true,
    },
    {
      id: "four_participants",
      description:
        "Does the diagram include all four participants: User, Browser, Auth Server, Resource Server?",
      critical: true,
    },
    {
      id: "auth_code_flow",
      description:
        "Does the diagram show the key OAuth2 steps: authorization request, redirect with code, token exchange, API call with token?",
      critical: true,
    },
    {
      id: "mermaid_code_block",
      description:
        "Is the diagram wrapped in a ```mermaid code block inside a markdown file?",
      critical: true,
    },
    {
      id: "file_saved",
      description:
        "Was the diagram saved to docs/auth-flow.md (or a file at the requested path)?",
      critical: true,
    },
    {
      id: "valid_syntax",
      description:
        "Does the Mermaid syntax use correct arrow notation (->>, -->>), participant declarations, and activate/deactivate where appropriate?",
      critical: false,
    },
  ];
}();
