---
name: foxcode-run-user-profile
description: Launch FoxCode in User Profile mode from Codex. Guides extension loading via about:debugging, opens connection page, verifies connectivity.
---

# FoxCode Run — User Profile

Use the canonical skill at `foxcode/skills/foxcode-run-user-profile/SKILL.md`.

Follow it exactly, with this Codex path adaptation:

- When the canonical skill says to run `${CLAUDE_SKILL_DIR}/../foxcode-run-project-profile/scripts/resolve_env.py`, run `foxcode/skills/foxcode-run-project-profile/scripts/resolve_env.py` from the repository root.
- Keep `status` as the only source of truth for `port` and `password`.
- Communicate in the user's language. Keep output minimal unless something fails.
