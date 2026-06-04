/**
 * Tier-4 acceptance: a real IDE binary (Claude Code / OpenCode / Codex) is given a
 * task; the IDE picks the foxcode MCP tool, drives a real headless Firefox
 * via the foxcode channel, and we observe both the tool-use event and the
 * final answer.
 *
 * This is the highest-fidelity test we can write without a human:
 * everything below the IDE is identical to a user's setup —
 *   - real `opencode` / `claude` / `codex` binary
 *   - real channel server spawned by the IDE from its native MCP config
 *   - real Firefox launched by the channel's `launchBrowser` MCP tool
 *     (FR-15), driven from the IDE prompt — no external spawner
 *   - real LLM call (so it costs tokens; gated behind FOXCODE_E2E_IDE=1)
 *
 * Runs via `deno test -A opencode/test/acceptance/ide-task.test.ts`,
 * invoked from `scripts/check.sh` only when `FOXCODE_E2E_IDE=1`.
 *
 * Deno is required because `@korchasa/ai-ide-cli` is published on JSR for
 * Deno; bringing the CLI's process/event machinery into Node would require
 * forking it. Cross-runtime test harness is acceptable for one opt-in test.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { getRuntimeAdapter } from "jsr:@korchasa/ai-ide-cli@0.8.2/runtime";
import type { RuntimeToolUseInfo } from "jsr:@korchasa/ai-ide-cli@0.8.2/runtime/types";
import type { RuntimeId } from "jsr:@korchasa/ai-ide-cli@0.8.2/types";
import { defaultRegistry } from "jsr:@korchasa/ai-ide-cli@0.8.2/process-registry";

const REPO_ROOT = new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");
const CHANNEL_SERVER = `${REPO_ROOT}/foxcode/channel/server.mjs`;
const TEST_PASSWORD = "test-pw-ide-fixed";
// All supported IDEs are always exercised. Run the dedicated command
// (`scripts/test-ide.sh` or `npm run --prefix opencode test:e2e-ide`) to
// trigger this test — there is no env-var gate.
const RUNTIMES: RuntimeId[] = ["opencode", "claude", "codex"];

// Free port within FoxCode's accepted range (8787–8886).
async function findFreeFoxcodePort(): Promise<number> {
  for (let i = 0; i < 20; i++) {
    const port = 8787 + Math.floor(Math.random() * 100);
    const listener = (() => {
      try { return Deno.listen({ hostname: "127.0.0.1", port }); }
      catch { return null; }
    })();
    if (listener) {
      listener.close();
      return port;
    }
  }
  throw new Error("No free port in 8787–8886");
}

async function findFreePort(): Promise<number> {
  const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const { port } = listener.addr as Deno.NetAddr;
  listener.close();
  return port;
}

async function writePasswordFile(home: string): Promise<void> {
  const dir = `${home}/.foxcode`;
  await Deno.mkdir(dir, { recursive: true, mode: 0o700 });
  await Deno.writeTextFile(`${dir}/password`, TEST_PASSWORD);
  await Deno.chmod(`${dir}/password`, 0o600);
}

/**
 * Build the typed mcpServers spec the adapter will inject runtime-natively:
 *   - Claude: rendered to a tmp `mcp.json`, passed via `--mcp-config`
 *   - OpenCode: serialised into `OPENCODE_CONFIG_CONTENT` env var
 *   - Codex: rendered to a tmp `.codex/config.toml` by the adapter
 * Single source of truth — no per-runtime config file writing in this test.
 */
function buildMcpServers(channelPort: number, fakeHome: string) {
  return {
    foxcode: {
      type: "stdio" as const,
      command: "node",
      args: [CHANNEL_SERVER],
      env: { HOME: fakeHome, FOXCODE_PORT: String(channelPort) },
    },
  };
}

for (const runtime of RUNTIMES) {
  Deno.test({
    name: `Tier-4 e2e/${runtime}: IDE drives foxcode evalInBrowser end-to-end`,
    sanitizeOps: false,
    sanitizeResources: false,
    sanitizeExit: false,
    fn: async () => {
      const tmp = await Deno.makeTempDir({ prefix: `fx-ide-${runtime}-` });
      const fakeHome = `${tmp}/home`;
      const cwd = `${tmp}/project`;
      await Deno.mkdir(fakeHome, { recursive: true });
      await Deno.mkdir(cwd, { recursive: true });
      await writePasswordFile(fakeHome);

      const channelPort = await findFreeFoxcodePort();
      const fixturePort = await findFreePort();
      const mcpServers = buildMcpServers(channelPort, fakeHome);

      // Test fixture HTTP server: data: URLs are blocked by the extension's
      // navigate validator; serve known HTML from a real http origin.
      const fixture = Deno.serve(
        { port: fixturePort, hostname: "127.0.0.1", onListen() {} },
        () =>
          new Response(
            "<!doctype html><title>FoxCodeIDETest</title><body><h1>HelloFromIDE</h1></body>",
            { headers: { "content-type": "text/html" } },
          ),
      );

      try {
        const observed: RuntimeToolUseInfo[] = [];
        const adapter = getRuntimeAdapter(runtime);
        const result = await adapter.invoke({
          processRegistry: defaultRegistry,
          taskPrompt:
            // Firefox is launched by the channel itself via `launchBrowser`
            // (FR-15). The IDE drives the full sequence end-to-end so the
            // test mirrors a user's flow without external spawners.
            `Step 1: call the foxcode \`status\` tool. ` +
            `\nStep 2: if \`connectedClients\` is 0, call foxcode \`launchBrowser\` ` +
            `with arguments \`{ "headless": true }\` and wait for it to return. ` +
            `A successful return value is one of \`{"status":"connected"}\`, ` +
            `\`{"status":"already-connected"}\`, or \`{"status":"already-running"}\`. ` +
            `\nStep 3: call the foxcode \`evalInBrowser\` ` +
            `tool with this code: ` +
            `\`await api.navigate("http://127.0.0.1:${fixturePort}/"); ` +
            `return await api.getTitle();\`. ` +
            `\nStep 4: report ONLY the returned title string in your final answer, nothing else.`,
          timeoutSeconds: 180,
          maxRetries: 1,
          retryDelaySeconds: 0,
          permissionMode: "bypassPermissions",
          cwd,
          mcpServers,
          // Claude-only: ignore user's ~/.claude.json + project .mcp.json so
          // pre-existing FoxCode CC-plugin install does not collide with the
          // typed spec under test. OpenCode adapter ignores this flag.
          strictMcpConfig: true,
          onToolUseObserved: (info) => {
            observed.push(info);
            return "allow";
          },
        });

        assert(!result.error, `${runtime} invoke errored: ${result.error ?? ""}`);
        const finalText = result.output?.result ?? "";
        assert(
          /FoxCodeIDETest/.test(finalText),
          `${runtime}: expected final answer to mention 'FoxCodeIDETest'; got: ${finalText.slice(0, 500)}`,
        );

        const foxcodeCalls = observed.filter((i) => /foxcode|evalInBrowser/i.test(i.name));
        assert(
          foxcodeCalls.length >= 1,
          `${runtime}: expected ≥1 foxcode tool-use; observed names: ${observed.map((o) => o.name).join(",")}`,
        );
        assertEquals(foxcodeCalls[0].runtime, runtime);
      } finally {
        // Firefox lifecycle is tied to the channel process (FR-15): the IDE
        // adapter terminates the channel on exit and the channel SIGTERMs
        // the managed web-ext process group via killProcessGroup.
        try { await fixture.shutdown(); } catch {}
        try {
          await Deno.remove(tmp, { recursive: true });
        } catch (err) {
          // Firefox profile flush race; warn-only (matches Tier-3 behaviour).
          console.error(`[ide-task.test] cleanup of ${tmp} failed: ${(err as Error).message}`);
        }
      }
    },
  });
}
