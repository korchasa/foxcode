# Static SKILL.md review rubric

Apply each criterion to a target SKILL.md. Verdict per criterion: `pass`, `fail`, or `n/a`, with a one-line note.

## 1. Metadata

- Frontmatter has `name` (lowercase, hyphens, `[a-z0-9-]`, ≤64 chars) and `description`.
- Description is third-person, contains WHAT (capability) and WHEN (trigger).
- `name + description` ≲ 100 tokens (~400 chars). Heuristic: `chars/4`.

## 2. Length

- Body under 500 lines.
- Body roughly under 5000 tokens (~20000 chars). Heuristic: `chars/4`.

## 3. Flow integrity

- Numbered steps or otherwise unambiguous ordering.
- Every documented branch (success, already-connected, error, timeout, retry) ends in a concrete action.
- No dangling reference: every `see also` / link target exists in the bundle or repo.

## 4. Output contract

- Tells the agent the exact user-facing reply on each branch (e.g. `"Ready."`, `"MCP server not running"`).
- Example blocks match the target delivery shape (chat reply, not a saved file).

## 5. Idempotency and source-of-truth

- Re-running mid-session does NOT re-launch.
- The source of truth for port/password is named (the MCP `status` response, not a disk file).

## 6. Negative paths

- "MCP not running" is handled with a definite outcome.
- Tool errors are relayed verbatim, with a concrete next action for the user.

## 7. Forbidden content

- No README/CHANGELOG/INSTALL-style auxiliary docs in the skill bundle.
- No deprecated commands, paths, or env vars (e.g. obsolete `${CLAUDE_PLUGIN_*}` references).
- No time-sensitive promises ("by next week", "in version X").

## Output shape

For each target skill, the judge subagent returns:

```
{
  "<skill-name>": {
    "metadata":   {"verdict": "...", "note": "..."},
    "length":     {"verdict": "...", "note": "..."},
    "flow":       {"verdict": "...", "note": "..."},
    "output":     {"verdict": "...", "note": "..."},
    "idempotency":{"verdict": "...", "note": "..."},
    "negative":   {"verdict": "...", "note": "..."},
    "forbidden":  {"verdict": "...", "note": "..."}
  }
}
```
