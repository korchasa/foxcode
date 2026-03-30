# Report Template

## Final Report Structure

Use this structure for the file saved to `research_<topic-slug>_<YYYYMMDD>.md`:

```markdown
---
topic: [research topic]
date: YYYY-MM-DD
directions: N
sources_accepted: N
sources_rejected: N
confidence: high | medium | low
---

# [Topic]: Research Report

## Executive Summary

[3–5 sentences: what was researched, top findings, overall confidence, any major gaps]

## Findings

### [Thematic Group 1]

**[FACT]** [Claim with specific data]. [N]

**[FACT]** [Claim]. [N][M] — confirmed by multiple sources.

**[FACT]** [Claim]. [N] [unverified — single source]

**[SYNTHESIS]** [Agent's analysis or inference based on above facts — no citation.]

#### Contradictions

> Sources [N] and [M] disagree: [N] states X, [M] states Y. Resolution: [note which is more recent/authoritative or leave unresolved].

### [Thematic Group 2]

...

## Gaps

What was searched but not found:

- [Direction or sub-question]: searched "[query 1]", "[query 2]" — no accepted sources found
- [Direction]: found sources but none met acceptance criteria (reason: [e.g., all older than 2020, no primary data])

## Bibliography

[1] [Author/Org]. "[Title]". [Publication]. [URL]. Retrieved [YYYY-MM-DD].
[2] ...

## Methodology

Directions investigated: [list]
Total queries executed: N
Sources evaluated: N (accepted: M, rejected: K)
Confidence basis: [e.g., "3+ independent sources for all major claims except [gap]"]
```

---

## Worker Output Format

Each sub-agent saves to `<tmp_dir>/<slug>.md` (system temp directory created by orchestrator) using this structure:

```markdown
# Direction: [direction name]

## Accepted Sources

### [N] [Source Title]
- URL: [url]
- Date: [YYYY-MM-DD or "unknown"]
- Why accepted: [one sentence matching acceptance criteria]
- Key facts:
  - [Fact 1 — exact quote or close paraphrase]
  - [Fact 2]

### [N+1] [Source Title]
...

## Rejected Sources

- [URL] — reason: [e.g., "published 2018, data outdated", "no primary data, opinion only"]

## Contradictions Found

- [Source A] says X; [Source B] says Y — [brief note on which is more credible or why conflict exists]

## Gaps

- Searched: "[query]" — no relevant results
- Searched: "[query]" — results found but none met acceptance criteria
```
