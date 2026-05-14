---
name: foxcode-run-project-profile
description: Launch FoxCode in Project Profile mode from Codex. Checks prerequisites, launches Firefox via web-ext, verifies connectivity.
---

# FoxCode Run — Project Profile

Use the canonical skill at `foxcode/skills/foxcode-run-project-profile/SKILL.md`.

Follow it exactly, with this Codex path adaptation:

- When the canonical skill says to run `${CLAUDE_SKILL_DIR}/scripts/launch_firefox.py`, run `foxcode/skills/foxcode-run-project-profile/scripts/launch_firefox.py` from the repository root.
- Keep `status` as the only source of truth for `port` and `password`.
- Communicate in the user's language. Keep output minimal unless something fails.
