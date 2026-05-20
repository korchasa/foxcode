---
name: foxcode-usage-analysis
description: Analyze historical Codex and Claude Code sessions for real FoxCode usage. Use when evaluating how effectively agents use FoxCode, evalInBrowser, launch skills, or browser automation across past sessions.
---

# FoxCode Usage Analysis

Analyze past Codex and Claude Code sessions to measure real FoxCode usage.

## Workflow

1. Read `documents/requirements.md` and `documents/design.md` for current FoxCode context.
2. Run the bundled analyzer from the repository root:

```bash
python3 .agents/skills/foxcode-usage-analysis/scripts/analyze_foxcode_usage.py
```

3. Treat these as the primary metrics:
   - `actual_sessions`: sessions with real `status`, `evalInBrowser`, or launch helper calls.
   - `mention_files`: noisy upper bound; includes sessions where FoxCode only appears in available tools/skills.
   - `eval_sessions`: sessions that actually used browser automation.
   - `reliable_flags`: sessions with concrete errors (`No connection`, `Timeout (`, invalid selector, missing host permission).
4. Inspect `recent_actual` examples in the script output before drawing conclusions.
5. Report in Russian unless the user asks otherwise.

## Interpretation Rules

- Do not count a session as FoxCode usage just because `foxcode` appears in the system prompt or tool catalog.
- Codex launch friction is indicated by high `launch_firefox` + `status` counts and low `evalInBrowser`.
- Effective use is indicated by multiple `evalInBrowser` calls after a successful connection, with few reliable flags.
- `text=` and `:has-text(...)` inside `evalInBrowser` arguments indicate Playwright-style selector confusion; FoxCode DOM helpers expect CSS selectors.
- `Missing host permission` often means the agent navigated to a tab or URL where the extension cannot inject. Prefer `api.eval(fetch(...))` from an allowed page for same-origin API checks.

## Output

Return a concise report:

```text
Scope: history locations, file counts, date range if visible.
Codex: actual sessions, eval sessions, call counts, reliable flags, main bottleneck.
Claude Code: actual sessions, eval sessions, call counts, reliable flags, main bottleneck.
Patterns: recurring inefficiencies and evidence.
Recommendations: concrete changes to FoxCode skills/docs.
```

If the script cannot read one IDE's history, report that path as blocked and continue with the other IDE.
