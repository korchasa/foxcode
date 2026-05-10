/**
 * @korchasa/foxcode-opencode — OpenCode plugin entry point.
 *
 * Lifecycle: registers a `session.created` hook (the earliest plugin-callable
 * hook documented at https://opencode.ai/docs/plugins/) which:
 *   1. seeds launch-skill symlinks into ~/.config/opencode/skills/
 *   2. writes ~/.foxcode/opencode-plugin-dir so the Python helpers can
 *      locate the bundled extension at skill-launch time
 *   3. lazily installs channel deps (npm ci --omit=dev)
 *   4. emits an MCP-snippet to stderr (once per process) when the user's
 *      opencode.json does not already declare mcp.foxcode
 *
 * The plugin never auto-edits opencode.json; users wanting a one-shot install
 * run the bundled CLI: `npx -y @korchasa/foxcode-opencode setup --write-config`.
 *
 * Bootstrap is registered on the hook (not eagerly at plugin load) so we
 * never run before OpenCode has finished its own initialisation.
 */
import { resolveFromModule } from "./lib/paths.mjs";
import { runSetup } from "./lib/setup.mjs";
import { buildMcpSnippet } from "./lib/mcp-snippet.mjs";

const PLUGIN_ROOT = resolveFromModule(import.meta.url, ".");
let didEmitSnippetThisProcess = false;

async function bootstrap() {
  const log = (m) => process.stderr.write(m.endsWith("\n") ? m : m + "\n");
  let report;
  try {
    report = await runSetup({
      pluginRoot: PLUGIN_ROOT,
      project: process.cwd(),
      writeConfig: false,
    });
  } catch (err) {
    log(`[foxcode-opencode] bootstrap failed: ${err.message}`);
    return;
  }
  if (!report.prereq.ok) {
    for (const p of report.prereq.problems) {
      log(`[foxcode-opencode] prereq problem: ${p}`);
    }
    return;
  }
  if (!report.configFound && !didEmitSnippetThisProcess) {
    log(
      `[foxcode-opencode] No mcp.foxcode entry in opencode.json. ` +
      `Add the snippet below and restart OpenCode:\n\n` +
      buildMcpSnippet(report.channelServer),
    );
    didEmitSnippetThisProcess = true;
  }
}

export default async function FoxCodeOpencodePlugin(_ctx) {
  return {
    "session.created": async () => {
      await bootstrap();
    },
  };
}

export const __test = { bootstrap };
