#!/usr/bin/env -S deno run --allow-run --allow-read

/**
 * flowai-lint-on-write hook: auto-lint ts/js/py files after Write/Edit.
 * PostToolUse hook - exit 0, stdout JSON with additionalContext on errors.
 */

/** Determine which linter to use based on file extension. */
export function shouldLint(filePath: string): "deno" | "ruff" | null {
  if (!filePath) return null;
  const ext = filePath.match(/\.[^.]+$/)?.[0]?.toLowerCase();
  if (!ext) return null;
  if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) return "deno";
  if (ext === ".py") return "ruff";
  return null;
}

/** Run linter on a file. Returns error string or null if clean/unavailable. */
export async function runLint(
  filePath: string,
  linter: "deno" | "ruff",
): Promise<string | null> {
  try {
    if (linter === "deno") {
      const cmd = new Deno.Command("deno", {
        args: ["lint", "--no-config", filePath],
        stdout: "piped",
        stderr: "piped",
      });
      const output = await cmd.output();
      if (output.code !== 0) {
        const stderr = new TextDecoder().decode(output.stderr);
        const stdout = new TextDecoder().decode(output.stdout);
        return (stderr + stdout).trim() || "deno lint failed";
      }
      return null;
    }

    if (linter === "ruff") {
      const cmd = new Deno.Command("ruff", {
        args: ["check", filePath],
        stdout: "piped",
        stderr: "piped",
      });
      const output = await cmd.output();
      if (output.code !== 0) {
        const stdout = new TextDecoder().decode(output.stdout);
        const stderr = new TextDecoder().decode(output.stderr);
        return (stdout + stderr).trim() || "ruff check failed";
      }
      return null;
    }
  } catch {
    // Linter not found - graceful degradation
    return null;
  }
  return null;
}

// --- Entry point (stdin -> stdout) ---
if (import.meta.main) {
  const input = JSON.parse(await new Response(Deno.stdin.readable).text());
  const filePath: string = input?.tool_input?.file_path ??
    input?.tool_input?.file ?? "";
  if (!filePath) Deno.exit(0);

  const linter = shouldLint(filePath);
  if (!linter) Deno.exit(0);

  const error = await runLint(filePath, linter);
  if (error) {
    console.log(JSON.stringify({ additionalContext: error }));
  }
}
