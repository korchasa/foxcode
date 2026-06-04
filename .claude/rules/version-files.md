---
paths:
  - "opencode/package.json"
  - "foxcode/.claude-plugin/plugin.json"
  - "foxcode/extension/manifest.json"
  - "foxcode/channel/package.json"
  - "foxcode/channel/package-lock.json"
  - "foxcode/.mcp.json"
  - "scripts/build-plugin-payload.mjs"
  - "opencode/lib/foxcode-mcp-entry.mjs"
  - "README.md"
description: Version file handling for FoxCode release metadata.
---

# Version Files

Do not manually revert or hand-edit version-only changes after packaging or check commands.

- Treat version synchronization from `opencode/prepack.mjs` as intentional release metadata behavior.
- If a command changes only version fields, leave the diff intact and report it.
- Change version fields only when the user explicitly asks for a version bump/release fix, or when editing the release automation itself.
- Never hide a version synchronization side effect by patching `opencode/package.json` back by hand.
