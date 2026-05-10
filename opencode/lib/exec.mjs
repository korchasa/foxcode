import { spawn } from "node:child_process";

/**
 * Run a command, capturing stdout/stderr. Cross-runtime: works under both
 * Bun (where OpenCode plugins typically run) and plain Node, since both
 * implement node:child_process.spawn.
 *
 * Resolves with { code, signal, stdout, stderr }. Either `code` (numeric
 * exit) or `signal` (string, e.g. "SIGTERM") will be non-null per Node's
 * spawn contract — never both. Caller decides how to handle non-zero or
 * signal-kill; we never reject on subprocess exit, only on spawn failure.
 */
export function exec(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out = [];
    const err = [];
    child.stdout.on("data", (b) => out.push(b));
    child.stderr.on("data", (b) => err.push(b));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      resolve({
        code,
        signal,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
      });
    });
  });
}
