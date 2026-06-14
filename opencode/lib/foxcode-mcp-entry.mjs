/**
 * Single source of truth for the shape of FoxCode's mcp.foxcode entry
 * in opencode.json.
 *
 * Under the unified-npx distribution model (documents/tasks/2026/06/
 * unify-mcp-distribution-via-npx.md), the entry resolves the channel
 * runtime via `npx -y foxcode-channel@<CHANNEL_SPEC>` — same shape as
 * the CC plugin's .mcp.json and the Codex plugin payload's .mcp.json.
 * Lockstep with foxcode/channel/package.json is enforced by
 * foxcode-mcp-entry.test.mjs.
 *
 * Both the snippet emitter (stderr / manual paste) and the patcher
 * (--write-config) call buildFoxcodeMcpEntry() here, so a field
 * addition (timeout, extra env var, …) needs only one edit.
 */

// Pinned exactly: no caret, no `latest`. Bumped together with
// foxcode/channel/package.json. Phase 0 P0.9 promoted 0.18.0 to npm
// `latest`.
export const CHANNEL_SPEC = "foxcode-channel@0.21.1";

export function buildFoxcodeMcpEntry() {
  return {
    type: "local",
    command: ["npx", "-y", CHANNEL_SPEC],
    // {env:VAR} is OpenCode-specific interpolation. Defensive override
    // so OpenCode hosts that don't forward cwd to the MCP child still
    // get the user's project dir; the channel's resolveProjectDir picks
    // FOXCODE_PROJECT_DIR over process.cwd() when non-empty.
    environment: { FOXCODE_PROJECT_DIR: "{env:PWD}" },
    enabled: true,
  };
}
