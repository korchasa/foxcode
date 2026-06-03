# foxcode-channel

MCP server that bridges Claude Code / Codex / OpenCode and the [FoxCode](https://github.com/korchasa/foxcode) Firefox WebExtension over a local WebSocket. Exposes two MCP tools — `evalInBrowser` (run arbitrary JavaScript in the current Firefox tab) and `status` (telemetry: connected extensions, bound port, uptime).

## Install via `npx` (recommended)

The channel is launched on demand by your IDE's MCP host. No global install needed — the IDE plugins ship this snippet:

```json
{
  "mcpServers": {
    "foxcode": {
      "command": "npx",
      "args": ["-y", "foxcode-channel@0.18.0"]
    }
  }
}
```

The corresponding browser extension must be loaded into Firefox separately — see [the FoxCode repo](https://github.com/korchasa/foxcode) for the bundled extension and launch skills.

## Architecture

- Transport: stdio JSON-RPC 2.0 (vanilla MCP, no experimental capabilities).
- Bridge: WebSocket `ws://localhost:<port>` with password auth at HTTP upgrade. Port is picked from a per-user range and persisted at `~/.foxcode/port`; password at `~/.foxcode/password` (mode 0600).
- Project dir: resolved via `FOXCODE_PROJECT_DIR` env var, else `process.cwd()`.

## Requirements

- Node.js ≥ 18.
- A FoxCode browser extension running and connected to the channel (driven by the IDE plugin's launch skill).

## License

MIT — see [LICENSE](https://github.com/korchasa/foxcode/blob/main/LICENSE).
