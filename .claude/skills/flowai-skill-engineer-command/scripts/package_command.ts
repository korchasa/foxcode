#!/usr/bin/env -S deno run -A
/**
 * Command Packager - Creates a distributable .skill file of a command folder
 *
 * Usage:
 *     deno run -A package_command.ts <path/to/command-folder> [output-directory]
 *
 * Example:
 *     deno run -A package_command.ts skills/public/flow-my-command
 *     deno run -A package_command.ts skills/public/flow-my-command ./dist
 */

import { basename, join, relative, resolve } from "jsr:@std/path";
import { validateCommand } from "./validate_command.ts";
import { walkSync } from "jsr:@std/fs/walk";

function packageCommand(
  commandPathArg: string,
  outputDir: string | null = null,
): string | null {
  const commandPath = resolve(commandPathArg);

  // Validate command folder exists
  try {
    const stat = Deno.statSync(commandPath);
    if (!stat.isDirectory) {
      console.error(`❌ Error: Path is not a directory: ${commandPath}`);
      return null;
    }
  } catch {
    console.error(`❌ Error: Command folder not found: ${commandPath}`);
    return null;
  }

  // Validate SKILL.md exists
  const skillMd = join(commandPath, "SKILL.md");
  try {
    Deno.statSync(skillMd);
  } catch {
    console.error(`❌ Error: SKILL.md not found in ${commandPath}`);
    return null;
  }

  // Run validation before packaging
  console.error("🔍 Validating command...");
  const [valid, message] = validateCommand(commandPath);
  if (!valid) {
    console.error(`❌ Validation failed: ${message}`);
    console.error("   Please fix the validation errors before packaging.");
    return null;
  }
  console.error(`✅ ${message}\n`);

  // Determine output location
  const commandName = basename(commandPath);
  let outputPath: string;
  if (outputDir) {
    outputPath = resolve(outputDir);
    Deno.mkdirSync(outputPath, { recursive: true });
  } else {
    outputPath = Deno.cwd();
  }

  const commandFilename = join(outputPath, `${commandName}.skill`);

  // Create the .skill file (zip format) using the `zip` command
  try {
    // Collect all files relative to parent directory
    const parentDir = resolve(commandPath, "..");
    const entries: string[] = [];

    for (const entry of walkSync(commandPath, { includeDirs: false })) {
      const arcname = relative(parentDir, entry.path);
      entries.push(arcname);
    }

    // Sort entries for deterministic output (Python's rglob returns sorted on most platforms)
    entries.sort();

    // Use zip command to create the archive
    // First, remove existing file if present
    try {
      Deno.removeSync(commandFilename);
    } catch {
      // File may not exist, that's fine
    }

    // Use zip -r with the command directory name from the parent dir
    // to preserve directory structure inside the archive.
    const zipCmd = new Deno.Command("zip", {
      args: ["-r", commandFilename, commandName],
      cwd: parentDir,
      stdout: "null",
      stderr: "piped",
    });

    const zipResult = zipCmd.outputSync();
    if (!zipResult.success) {
      const stderr = new TextDecoder().decode(zipResult.stderr);
      console.error(
        `❌ Error creating .skill file: zip command failed: ${stderr}`,
      );
      return null;
    }

    // Print added files (matching Python output format: relative to parent)
    for (const arcname of entries) {
      console.error(`  Added: ${arcname}`);
    }

    console.error(`\n✅ Successfully packaged command to: ${commandFilename}`);
    return commandFilename;
  } catch (e) {
    console.error(`❌ Error creating .skill file: ${e}`);
    return null;
  }
}

function main(): void {
  if (Deno.args.length < 1) {
    console.error(
      "Usage: deno run -A package_command.ts <path/to/command-folder> [output-directory]",
    );
    console.error("\nExample:");
    console.error(
      "  deno run -A package_command.ts skills/public/flow-my-command",
    );
    console.error(
      "  deno run -A package_command.ts skills/public/flow-my-command ./dist",
    );
    Deno.exit(1);
  }

  const commandPath = Deno.args[0];
  const outputDir = Deno.args.length > 1 ? Deno.args[1] : null;

  console.error(`📦 Packaging command: ${commandPath}`);
  if (outputDir) {
    console.error(`   Output directory: ${outputDir}`);
  }
  console.error();

  const result = packageCommand(commandPath, outputDir);

  if (result) {
    console.log(JSON.stringify({ ok: true, result: { archive: result } }));
    Deno.exit(0);
  } else {
    console.log(
      JSON.stringify({ ok: false, error: "Command packaging failed" }),
    );
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}
