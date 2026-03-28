import { BenchmarkSkillScenario } from "@bench/types.ts";

export const WriteDepBasicBench = new class extends BenchmarkSkillScenario {
  id = "flowai-skill-write-dep-basic";
  name = "Write a DEP for Cache Migration";
  skill = "flowai-skill-write-dep";
  agentsTemplateVars = {
    PROJECT_NAME: "CacheMigration",
  };
  stepTimeoutMs = 420_000;

  userQuery =
    "/flowai-skill-write-dep Write a DEP for migrating our caching layer from Redis standalone to Redis Cluster. Current state: p99 latency went from 50ms to 800ms over 3 months, 15 degradation incidents in Q4, DAU grew from 100K to 500K, cache hit ratio dropped from 95% to 72%.";

  interactive = true;
  userPersona =
    "You are a backend engineer proposing a Redis Cluster migration. When asked about stakeholders, say the SRE team and product leads. When asked about timeline, say 2 months. When asked about budget, say we have approval for 3 engineer-months. Keep answers brief.";
  maxSteps = 20;

  checklist = [
    {
      id: "dep_file_created",
      description:
        "Did the agent create a DEP document file (e.g., a markdown file with DEP in the name or path)?",
      critical: true,
    },
    {
      id: "has_executive_summary",
      description:
        "Does the DEP contain an Executive Summary section that is understandable on its own?",
      critical: true,
    },
    {
      id: "problem_with_data",
      description:
        "Does the Problem Statement use specific metrics/data (latency numbers, incident counts, DAU growth) rather than vague descriptions?",
      critical: true,
    },
    {
      id: "alternatives_analyzed",
      description:
        "Does the DEP analyze at least 2 alternatives (including 'do nothing') with pros and cons?",
      critical: true,
    },
    {
      id: "risks_with_mitigation",
      description:
        "Does the DEP list specific risks with probability, impact, and mitigation plans?",
      critical: true,
    },
    {
      id: "measurable_success_criteria",
      description:
        "Does the DEP define measurable success criteria with current and target values?",
      critical: true,
    },
    {
      id: "implementation_plan",
      description:
        "Does the DEP include an implementation plan with phases and a rollback strategy?",
      critical: false,
    },
    {
      id: "metadata_present",
      description: "Does the DEP include metadata (author, status, date)?",
      critical: false,
    },
  ];
}();
