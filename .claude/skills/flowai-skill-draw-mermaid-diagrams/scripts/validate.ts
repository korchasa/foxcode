/**
 * Mermaid diagram syntax validator.
 * Validates .mmd/.md files using the official mermaid-cli (mmdc) via npx.
 *
 * Usage: deno run --allow-run --allow-read --allow-write --allow-env scripts/validate.ts path/to/diagram.mmd
 *
 * Output (stdout): JSON { "ok": bool, "result": { "valid": bool, "file": string, "errors": string[] } }
 * Diagnostics: stderr
 *
 * Requires: npx (Node.js) - mmdc is invoked via `npx -y -p @mermaid-js/mermaid-cli mmdc`.
 */

export interface ValidateResult {
  valid: boolean;
  file: string;
  errors: string[];
}

export async function validateMermaid(
  filePath: string,
): Promise<ValidateResult> {
  // Check file exists
  try {
    await Deno.stat(filePath);
  } catch {
    return {
      valid: false,
      file: filePath,
      errors: [`File not found: ${filePath}`],
    };
  }

  // Find npx
  const npxCmd = Deno.build.os === "windows" ? "npx.cmd" : "npx";
  const which = new Deno.Command("which", {
    args: [npxCmd],
    stdout: "null",
    stderr: "null",
  });
  const whichOut = await which.output();
  if (!whichOut.success) {
    return {
      valid: false,
      file: filePath,
      errors: [
        "'npx' is not found. Install Node.js and npm to validate Mermaid diagrams.",
      ],
    };
  }

  // Create temp output file
  const tempPath = await Deno.makeTempFile({ suffix: ".svg" });

  try {
    console.error(`Validating ${filePath}...`);

    const cmd = new Deno.Command(npxCmd, {
      args: [
        "-y",
        "-p",
        "@mermaid-js/mermaid-cli",
        "mmdc",
        "-i",
        filePath,
        "-o",
        tempPath,
      ],
      stdout: "piped",
      stderr: "piped",
    });

    const output = await cmd.output();
    const stderr = new TextDecoder().decode(output.stderr).trim();

    if (output.success) {
      console.error("Syntax is valid.");
      return { valid: true, file: filePath, errors: [] };
    } else {
      const errors = stderr
        ? stderr.split("\n").filter((l) => l.trim())
        : ["Unknown validation error"];
      console.error(`Syntax Error in ${filePath}:\n${stderr}`);
      return { valid: false, file: filePath, errors };
    }
  } finally {
    try {
      await Deno.remove(tempPath);
    } catch { /* ignore cleanup errors */ }
  }
}

if (import.meta.main) {
  if (Deno.args.length === 0) {
    console.error(
      "Usage: deno run --allow-run --allow-read --allow-write --allow-env scripts/validate.ts <file>",
    );
    Deno.exit(1);
  }

  const filePath = Deno.args[0];
  const result = await validateMermaid(filePath);
  const ok = result.valid;
  console.log(JSON.stringify({ ok, result }));

  if (!ok) {
    Deno.exit(1);
  }
}
