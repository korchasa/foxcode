---
name: foxcode-skill-qa
description: >
  Quality-test the user-facing FoxCode skills (`foxcode-run-project-profile`, `foxcode-run-user-profile`) by spawning fresh subagents per probe so context cannot leak. Judges triggering accuracy, end-state correctness, robustness on negative prompts, and adherence to the SKILL.md flow. Use when asked to QA, audit, benchmark, regression-check, or smoke-test FoxCode skills, or to validate that a SKILL.md edit did not break the run flow.
---

# FoxCode Skill QA

Probe the skill layer itself: does the description trigger correctly, does the documented flow lead to the expected end state, are edge cases covered.

Different from neighbouring skills:
- `foxcode-acceptance-testing` — channel/extension behaviour end-to-end.
- `foxcode-distribution-testing` — install/update/packaging.
- `foxcode-usage-analysis` — historical session forensics.

## Targets under test

The user-facing skills shipped to end users:
- `foxcode/skills/foxcode-run-project-profile/SKILL.md`
- `foxcode/skills/foxcode-run-user-profile/SKILL.md`

Dev-side launch wrappers (`.agents/skills/foxcode-run-*`) are the same source — covered transitively.

## Subagent encapsulation rule

Every probe runs in a fresh `Agent` (subagent) call. Rationale: this parent conversation already knows the answers (which skill to call, which MCP tool returns what). Subagents start cold and behave like a real user-facing session.

When spawning, hand the subagent ONLY:
- The user-style prompt for that probe.
- The list of tools it may use.
- The required JSON return shape.

Never reveal in the subagent prompt that it is being tested. Never paste this skill's contents, the rubric, or the expected verdict into the subagent prompt.

The subagent returns a structured JSON report; the parent judges it.

## Probe categories

### A. Static review — no execution

One judge subagent reads both target SKILL.md files and scores them against `references/rubric.md`. Cheap, run every time. Output: pass/fail per criterion.

Subagent prompt: "Read these files: [list]. For each, score against the rubric in [references/rubric.md]. Return JSON `{<skill-name>: {<criterion>: {verdict, note}}}`."

### B. Triggering probe — cold, no execution

For each prompt in `references/scenarios.md` § "Trigger probes", dispatch a fresh subagent with that prompt only. The subagent is told to PLAN ONLY — decide which skill (if any) it would invoke first, without executing it.

Verdict per prompt: `skill_invoked` matches the expected target, or `wrong-skill` / `no-match`.

### C. Behavioural probe — real Firefox

Heavyweight. Requires a live MCP server and Firefox.

Parent does preflight (never delegated to the subagent):
1. Call `mcp__foxcode__status`. If it fails → abort C with `blocked: mcp-down`.
2. For "cold launch" probes, ensure `connectedClients == 0`. If non-zero, ask the user to close Firefox (do not pkill silently — that is the user's session).

Then spawn the subagent for one scenario. After it returns, parent verifies end state by calling `mcp__foxcode__status` and one `mcp__foxcode__evalInBrowser` smoke (`return document.readyState;` after `await api.navigate("about:blank")`).

Behavioural probes are opt-in. Ask the user before running them — they cost real LLM tokens and touch their Firefox.

### D. Robustness probe — negative scenarios

Prompts that should NOT invoke a launch skill (read-only intent, design questions, status-only intent). Pass = subagent's `tool_calls` list does NOT contain `launchBrowser` or a `Skill foxcode-run-*` invocation.

## Workflow

1. Confirm with the user which categories to run. Default = A + B + D. Ask before C (real Firefox).
2. Parent reads each target SKILL.md once for the report header.
3. Dispatch subagents in parallel where independent (single A judge call + every B and D prompt). Serialize C probes — they share Firefox state.
4. Aggregate verdicts into the report below. Do not edit SKILL.md unless the user explicitly asks to fix what was found.

## Subagent prompt template

Use this exact shape when spawning a probe subagent. Substitute `{...}` placeholders.

```
You are a fresh agent helping a user. Respond as you would to any real user request — do not behave as if you are being tested.

User said: "{user_prompt}"

Allowed tools: {allowed_tools}.

{mode_instruction}

When finished, return EXACTLY this JSON object (no surrounding prose, no markdown fence):
{
  "skill_invoked": "<skill name or null>",
  "tool_calls": ["<tool name per call, in order>"],
  "final_user_message": "<your last user-facing line>",
  "blockers": "<obstacle encountered, or null>"
}
```

Where `{mode_instruction}` is one of:
- Trigger (B): `Plan only. Decide which skill (if any) you would call first, then return the JSON. DO NOT invoke that skill or any other tool.`
- Behavioural (C): `Carry out the request normally. Stop when the launch flow reaches a Ready state, surfaces an error, or asks the user for input.`
- Robustness (D): `Carry out the request normally.`

Allowed tools per mode:
- B: none (plan only).
- C: `Skill`, `mcp__foxcode__status`, `mcp__foxcode__launchBrowser`, `mcp__foxcode__evalInBrowser`, `Read`, `Bash`.
- D: `Read`, `mcp__foxcode__status`.

## Verdict format

Return one block per target skill:

```
foxcode-run-project-profile
- static: pass | fail (criteria failed: ...)
- trigger: pass (N/M matched) | fail (mismatches: ...)
- behaviour: pass | blocked: <reason> | fail: <root cause>
- robustness: pass | fail (false positives: ...)
- notes: <one line>
```

Then an aggregate: `all-pass | partial | fail`.

## References

- Probe scenario library: [references/scenarios.md](references/scenarios.md)
- Static-review rubric: [references/rubric.md](references/rubric.md)
