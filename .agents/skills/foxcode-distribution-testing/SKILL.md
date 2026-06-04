---
name: foxcode-distribution-testing
description: >
  Test FoxCode distribution when asked to verify install/update paths, plugin packaging, marketplace contents, npm pack output, Claude Code plugin delivery, Codex plugin/config delivery, OpenCode package delivery, release readiness, or user-machine installation behavior.
---

# FoxCode Distribution Testing

Use this skill for packaging and installation. For runtime browser automation behavior, use `foxcode-acceptance-testing` after distribution checks pass.

## Ground rules

- Read `documents/requirements.md` and `documents/design.md` before testing.
- Inspect the produced artifact or installed target environment before claiming distribution works.
- Do not document third-party behavior unless you have observed tool output from this machine.
- Do not make debug commits on `main`.
- Use relative paths inside the repository. Absolute paths are acceptable only for external installed locations such as `~/.claude`, `~/.codex`, and `~/.config/opencode`.
- Expect `opencode/prepack.mjs` to sync `opencode/package.json` from `foxcode/.claude-plugin/plugin.json`; check `git status --short` after packaging commands.

## Baseline

Run:

```bash
bash scripts/check.sh
```

If baseline fails, distribution testing is blocked until the baseline is fixed or the user explicitly asks for packaging-only diagnosis.

## Version and manifest consistency

Inspect:

```bash
jq -r '.version' foxcode/.claude-plugin/plugin.json
jq -r '.version' foxcode/extension/manifest.json
jq -r '.version' foxcode/channel/package.json
jq -r '.version' opencode/package.json
jq . .claude-plugin/marketplace.json
jq . foxcode/.claude-plugin/plugin.json
jq . foxcode/extension/manifest.json
```

Expected:

- `foxcode/.claude-plugin/plugin.json`, `foxcode/extension/manifest.json`, and `foxcode/channel/package.json` carry the release version.
- `opencode/package.json` is either already in sync or becomes synced by `opencode/prepack.mjs`.
- Marketplace points to the plugin payload that actually contains `channel/`, `extension/`, `skills/`, and `.mcp.json`.

## Claude Code plugin path

Run when Claude Code distribution is in scope:

```bash
claude plugin validate .
claude mcp list
```

Inspect installed or marketplace-copy contents when available:

```bash
find ~/.claude/plugins/marketplaces/korchasa -maxdepth 3 -type d -name extension -o -name channel -o -name skills
find ~/.claude/plugins/cache/korchasa/foxcode -maxdepth 4 -type d -name extension -o -name channel -o -name skills
```

Required artifact contents:

- `foxcode/.mcp.json`
- `foxcode/channel/server.mjs`
- `foxcode/channel/package.json`
- `foxcode/extension/manifest.json`
- `foxcode/skills/foxcode-run-project-profile/SKILL.md`
- `foxcode/skills/foxcode-run-user-profile/SKILL.md`

If `CLAUDE_PLUGIN_ROOT` behavior is relevant, verify it with the plugin runtime `status` tool before documenting it.

## Codex path

Run when Codex distribution/config is in scope:

```bash
codex mcp get foxcode
```

Inspect:

```bash
sed -n '1,220p' .codex/config.toml
find .agents/skills -maxdepth 2 -type f -name SKILL.md | sort
find ~/.codex/plugins/cache/korchasa/foxcode -maxdepth 4 -type d -name channel -o -name extension -o -name skills 2>/dev/null
```

Expected:

- Repo-scoped Codex config starts `foxcode/channel/server.mjs` from the repository checkout.
- `.agents/skills/foxcode-run-project-profile/SKILL.md` and `.agents/skills/foxcode-run-user-profile/SKILL.md` exist.
- If marketplace install is tested, inspect the actual cache layout and confirm whether Codex can resolve the versioned payload before claiming support.

## OpenCode package path

Run when OpenCode distribution is in scope:

```bash
node opencode/bin/foxcode-opencode.mjs doctor
cd opencode && npm pack --dry-run
```

After `npm pack --dry-run`, return to the repository root and run:

```bash
git status --short
```

Inspect the dry-run file list for:

- `bundle/channel/server.mjs`
- `bundle/channel/package.json`
- `bundle/extension/manifest.json`
- `bundle/skills/foxcode-run-project-profile/SKILL.md`
- `bundle/skills/foxcode-run-user-profile/SKILL.md`
- `index.mjs`
- `bin/foxcode-opencode.mjs`
- `lib/`

Also verify the installed OpenCode config when testing a user-machine setup:

```bash
opencode --version
opencode mcp list
opencode debug paths
cat ~/.config/opencode/opencode.json
```

Expected:

- `mcp.foxcode` is enabled.
- The server command resolves to `npx -y foxcode-channel@<pinned>` (channel + Firefox extension are both pulled from npm — no in-tree channel path, no handoff file under `~/.foxcode/`).
- `FOXCODE_PROJECT_DIR` uses OpenCode's `{env:PWD}` interpolation.

## Release artifact

When release packaging is in scope, build and inspect the extension archive:

```bash
cd foxcode/extension && zip -r ../../foxcode-extension.xpi . -x '*.test.js'
```

Then inspect archive contents:

```bash
unzip -l foxcode-extension.xpi
```

Required:

- `manifest.json`
- `background/`
- `content/`
- `popup/`
- `icons/`
- no test files in the archive.

## Final gate

A distribution check can pass only when:

- Baseline passes.
- The requested distribution artifact exists and contains the expected files.
- The installed target environment, if tested, points to that artifact.
- Runtime acceptance (`foxcode-acceptance-testing`) passes for the target path or is explicitly out of scope.

Report `pass`, `blocked`, or `fail` with commands and key evidence.
