#!/usr/bin/env -S deno run --allow-run --allow-read

/**
 * flowai-test-before-commit hook: block git commit if tests fail.
 * PreToolUse hook — exit 0 = allow, exit 2 = block.
 */

/** Check if the command is a git commit (not echoed or printed). */
export function isGitCommit(command: string): boolean {
  if (!command) return false;

  // Strip quoted strings to avoid matching git commit inside echo/printf args
  const stripped = command.replace(/"[^"]*"|'[^']*'/g, '""');

  // Match: optional leading whitespace or separators (&&, ;, |, subshell),
  // then git with optional -c flags, then commit subcommand
  return /(?:^|\(|[;&|])\s*git\s+(?:-c\s+\S+\s+)*commit\b/.test(stripped);
}

/** Detect test runner by project markers. Returns command + marker or null. */
export async function detectRunner(
  cwd: string,
): Promise<{ cmd: string[]; marker: string } | null> {
  const markers: Array<{ file: string; cmd: string[]; marker: string }> = [
    { file: "deno.json", cmd: ["deno", "task", "check"], marker: "deno.json" },
    {
      file: "package.json",
      cmd: ["npm", "test"],
      marker: "package.json",
    },
    { file: "Makefile", cmd: ["make", "test"], marker: "Makefile" },
  ];

  for (const m of markers) {
    try {
      await Deno.stat(`${cwd}/${m.file}`);
      return { cmd: m.cmd, marker: m.marker };
    } catch {
      // File not found, try next
    }
  }
  return null;
}

// --- Entry point (stdin → exit code) ---
if (import.meta.main) {
  const input = JSON.parse(await new Response(Deno.stdin.readable).text());
  const command: string = input?.tool_input?.command ?? "";

  if (!isGitCommit(command)) Deno.exit(0);

  // Determine project root from env or cwd
  const cwd = Deno.env.get("CLAUDE_PROJECT_DIR") ??
    Deno.env.get("CURSOR_PROJECT_DIR") ?? Deno.cwd();

  const runner = await detectRunner(cwd);
  if (!runner) {
    // No test runner found — allow commit
    Deno.exit(0);
  }

  console.error(
    `[flowai-test-before-commit] Running tests (${runner.marker})...`,
  );

  const proc = new Deno.Command(runner.cmd[0], {
    args: runner.cmd.slice(1),
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });
  const result = await proc.output();

  if (result.code !== 0) {
    console.error(
      `[flowai-test-before-commit] Tests failed. Commit blocked.`,
    );
    Deno.exit(2); // Block the commit
  }
}
