import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer as createNetServer } from "node:net";

/**
 * Run `fn(tmpDir)` inside a fresh temp directory and clean it up afterwards
 * even on throw. The directory name is prefixed with `fx-` so leftovers are
 * easy to spot if cleanup is bypassed.
 */
export async function withTmp(fn) {
  const tmp = mkdtempSync(join(tmpdir(), "fx-"));
  try {
    return await fn(tmp);
  } finally {
    // Cleanup must never mask a real test failure. Long-running orphan child
    // writers (Firefox profile flush, etc.) can race rmSync; retry then warn.
    try {
      rmSync(tmp, { recursive: true, force: true, maxRetries: 8, retryDelay: 500 });
    } catch (err) {
      process.stderr.write(`[withTmp] cleanup of ${tmp} failed (left for OS): ${err.message}\n`);
    }
  }
}

/**
 * Override env vars and return a restore function.
 *   const restore = sandboxEnv({ HOME: "/tmp/fake" });
 *   try { ... } finally { restore(); }
 *
 * Plain function (not Symbol.dispose) for portability with Node versions
 * where `using` requires --experimental-explicit-resource-management.
 */
export function sandboxEnv(overrides) {
  const prior = {};
  for (const [k, v] of Object.entries(overrides)) {
    prior[k] = process.env[k];
    process.env[k] = v;
  }
  return function restore() {
    for (const [k, v] of Object.entries(prior)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}

/** Run `fn` with `overrides` env vars active; restores on completion or throw. */
export async function withEnv(overrides, fn) {
  const restore = sandboxEnv(overrides);
  try {
    return await fn();
  } finally {
    restore();
  }
}

/** Capture writes to process.stderr for the duration of an async fn. */
export async function captureStderr(fn) {
  const writes = [];
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => {
    writes.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  };
  try {
    await fn();
  } finally {
    process.stderr.write = orig;
  }
  return writes.join("");
}

/**
 * Find a free TCP port by binding-and-closing on 127.0.0.1:0.
 * Optional `range` constrains to a [lo, hi) window — required when the test
 * exercises the FoxCode extension, whose URL-hash parser only accepts ports
 * in 8787–8886 (the BASE_PORT/PORT_RANGE constants in foxcode/channel/lib.mjs).
 *
 * There is a small TOCTOU window between this returning and a caller binding
 * the port. Mitigated by retrying on EADDRINUSE up to `attempts` times.
 */
export function findFreePort(opts = {}) {
  const { range = null, attempts = 20 } = opts;
  return tryBindOnce(range, attempts);
}

function tryBindOnce(range, remaining) {
  return new Promise((resolve, reject) => {
    const srv = createNetServer();
    srv.unref();
    srv.on("error", (err) => {
      if (err.code === "EADDRINUSE" && remaining > 1) {
        resolve(tryBindOnce(range, remaining - 1));
      } else {
        reject(err);
      }
    });
    const tryPort = range ? range[0] + Math.floor(Math.random() * (range[1] - range[0])) : 0;
    srv.listen(tryPort, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

/** Free port within FoxCode's extension-accepted range (8787–8886). */
export function findFreeFoxcodePort() {
  return findFreePort({ range: [8787, 8887] });
}
