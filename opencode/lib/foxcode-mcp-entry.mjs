/**
 * Single source of truth for the shape of FoxCode's mcp.foxcode entry.
 * Both the snippet emitter (for stderr / manual paste) and the patcher
 * (for --write-config) build their entries through here, so adding a
 * new field (timeout, environment var, etc.) only requires one edit.
 */
export function buildFoxcodeMcpEntry(channelServerAbsPath) {
  return {
    type: "local",
    command: ["node", channelServerAbsPath],
    environment: { FOXCODE_PROJECT_DIR: "{env:PWD}" },
    enabled: true,
  };
}
