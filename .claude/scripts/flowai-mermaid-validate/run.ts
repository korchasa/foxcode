#!/usr/bin/env -S deno run --allow-run --allow-read

/**
 * flowai-mermaid-validate hook: auto-validate Mermaid diagrams after .md/.mmd edits.
 * PostToolUse hook - exit 0, stdout JSON with additionalContext on errors.
 */

/** Check if file extension is Mermaid-relevant. */
export function isMermaidExt(filePath: string): boolean {
  if (!filePath) return false;
  const ext = filePath.match(/\.[^.]+$/)?.[0]?.toLowerCase();
  return ext === ".mmd" || ext === ".md";
}

/** Check if content contains Mermaid code blocks. */
export function hasMermaidBlocks(content: string): boolean {
  if (!content) return false;
  return /```mermaid\b/m.test(content);
}

/** Validate Mermaid diagrams in file. Returns error string or null. */
export async function validateMermaid(
  filePath: string,
): Promise<string | null> {
  let content: string;
  try {
    content = await Deno.readTextFile(filePath);
  } catch {
    return `File not found: ${filePath}`;
  }

  // For .md files, only validate if there are Mermaid blocks
  if (filePath.endsWith(".md") && !hasMermaidBlocks(content)) {
    return null;
  }

  // Try to find mmdc (mermaid-cli)
  try {
    const cmd = new Deno.Command("npx", {
      args: [
        "-y",
        "@mermaid-js/mermaid-cli",
        "mmdc",
        "-i",
        filePath,
        "-o",
        "/dev/null",
      ],
      stdout: "piped",
      stderr: "piped",
    });
    const output = await cmd.output();
    if (output.code !== 0) {
      const stderr = new TextDecoder().decode(output.stderr);
      return `Mermaid validation failed:\n${stderr.trim()}`;
    }
    return null;
  } catch {
    // mmdc/npx not available - graceful degradation
    return null;
  }
}

// --- Entry point (stdin -> stdout) ---
if (import.meta.main) {
  const input = JSON.parse(await new Response(Deno.stdin.readable).text());
  const filePath: string = input?.tool_input?.file_path ??
    input?.tool_input?.file ?? "";

  if (!filePath || !isMermaidExt(filePath)) Deno.exit(0);

  // For .md files, read content to check for Mermaid blocks before validation
  if (filePath.endsWith(".md")) {
    try {
      const content = await Deno.readTextFile(filePath);
      if (!hasMermaidBlocks(content)) Deno.exit(0);
    } catch {
      Deno.exit(0);
    }
  }

  const error = await validateMermaid(filePath);
  if (error) {
    console.log(JSON.stringify({ additionalContext: error }));
  }
}
