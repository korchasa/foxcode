#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const outputPath = path.resolve(
  process.env.CODEX_ENV_PROBE_OUTPUT ??
    process.env.FOXCODE_ENV_PROBE_OUTPUT ??
    path.join(os.tmpdir(), `codex-env-probe-${process.pid}.json`),
);

const startedAt = new Date().toISOString();
const messages = [];

function sortedEnv() {
  return Object.fromEntries(
    Object.entries(process.env).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

function safeRealpath(value) {
  try {
    return fs.realpathSync(value);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function snapshot(extra = {}) {
  return {
    schemaVersion: 1,
    startedAt,
    updatedAt: new Date().toISOString(),
    process: {
      pid: process.pid,
      ppid: process.ppid,
      execPath: process.execPath,
      argv: process.argv,
      argv0: process.argv0,
      cwd: process.cwd(),
      cwdRealpath: safeRealpath(process.cwd()),
      platform: process.platform,
      arch: process.arch,
      version: process.version,
      versions: process.versions,
      uid: typeof process.getuid === "function" ? process.getuid() : null,
      gid: typeof process.getgid === "function" ? process.getgid() : null,
      umask: process.umask(),
    },
    environment: sortedEnv(),
    selectedEnvironment: {
      PWD: process.env.PWD ?? null,
      INIT_CWD: process.env.INIT_CWD ?? null,
      CODEX_HOME: process.env.CODEX_HOME ?? null,
      PLUGIN_ROOT: process.env.PLUGIN_ROOT ?? null,
      PLUGIN_DATA: process.env.PLUGIN_DATA ?? null,
      CLAUDE_PLUGIN_ROOT: process.env.CLAUDE_PLUGIN_ROOT ?? null,
      CLAUDE_PLUGIN_DATA: process.env.CLAUDE_PLUGIN_DATA ?? null,
      FOXCODE_PROJECT_DIR: process.env.FOXCODE_PROJECT_DIR ?? null,
      CODEX_ENV_PROBE_OUTPUT: process.env.CODEX_ENV_PROBE_OUTPUT ?? null,
      FOXCODE_ENV_PROBE_OUTPUT: process.env.FOXCODE_ENV_PROBE_OUTPUT ?? null,
    },
    mcp: {
      protocol: "json-rpc-line-delimited",
      receivedMessages: messages,
    },
    ...extra,
  };
}

function writeSnapshot(extra) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(snapshot(extra), null, 2)}\n`);
  fs.renameSync(tempPath, outputPath);
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function respond(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function respondError(id, code, message) {
  send({
    jsonrpc: "2.0",
    id,
    error: { code, message },
  });
}

function recordMessage(message) {
  messages.push({
    at: new Date().toISOString(),
    message,
  });
  writeSnapshot();
}

function handleRequest(message) {
  const { id, method, params } = message;

  if (method === "initialize") {
    respond(id, {
      protocolVersion: params?.protocolVersion ?? "2025-06-18",
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: "codex-env-probe",
        version: "0.1.0",
      },
    });
    return;
  }

  if (method === "ping") {
    respond(id, {});
    return;
  }

  if (method === "tools/list") {
    respond(id, {
      tools: [
        {
          name: "read_probe_snapshot",
          description:
            "Return the current Codex environment probe snapshot and output path.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
        },
      ],
    });
    return;
  }

  if (method === "tools/call") {
    if (params?.name !== "read_probe_snapshot") {
      respondError(id, -32602, `Unknown tool: ${params?.name ?? "<missing>"}`);
      return;
    }

    const current = snapshot({ outputPath });
    respond(id, {
      content: [
        {
          type: "text",
          text: JSON.stringify(current, null, 2),
        },
      ],
      isError: false,
    });
    return;
  }

  respondError(id, -32601, `Method not found: ${method}`);
}

function handleMessage(message) {
  recordMessage(message);
  if (Object.hasOwn(message, "id")) {
    handleRequest(message);
  }
}

let buffer = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  for (;;) {
    const newlineIndex = buffer.indexOf("\n");
    if (newlineIndex === -1) break;

    const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
    buffer = buffer.slice(newlineIndex + 1);
    if (!line.trim()) continue;

    try {
      handleMessage(JSON.parse(line));
    } catch (error) {
      writeSnapshot({
        parseError: error instanceof Error ? error.message : String(error),
        parseInput: line,
      });
    }
  }
});

process.stdin.on("end", () => {
  writeSnapshot({ stdinEndedAt: new Date().toISOString() });
});

process.on("uncaughtException", (error) => {
  writeSnapshot({
    uncaughtException: {
      message: error.message,
      stack: error.stack,
    },
  });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  writeSnapshot({
    unhandledRejection: reason instanceof Error
      ? { message: reason.message, stack: reason.stack }
      : { value: reason },
  });
  process.exit(1);
});

writeSnapshot({ outputPath });
console.error(`codex-env-probe wrote ${outputPath}`);
