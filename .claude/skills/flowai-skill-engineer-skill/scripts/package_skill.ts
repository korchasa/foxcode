#!/usr/bin/env -S deno run -A
/**
 * Skill Packager - Creates a distributable .skill file
 *
 * Usage:
 *     deno run -A package_skill.ts <path/to/skill-folder> [output-directory]
 *
 * Example:
 *     deno run -A package_skill.ts .cursor/skills/code-review
 *     deno run -A package_skill.ts .cursor/skills/code-review ./dist
 */

import { basename, join, resolve } from "jsr:@std/path";
import { validateSkill } from "./validate_skill.ts";

export async function packageSkill(
  skillPath: string,
  outputDir?: string | null,
): Promise<string | null> {
  const resolvedSkillPath = resolve(skillPath);

  // Check skill folder exists
  try {
    const stat = await Deno.stat(resolvedSkillPath);
    if (!stat.isDirectory) {
      console.error(`Error: Path is not a directory: ${resolvedSkillPath}`);
      return null;
    }
  } catch {
    console.error(`Error: Skill folder not found: ${resolvedSkillPath}`);
    return null;
  }

  // Check SKILL.md exists
  try {
    await Deno.stat(join(resolvedSkillPath, "SKILL.md"));
  } catch {
    console.error(`Error: SKILL.md not found in ${resolvedSkillPath}`);
    return null;
  }

  // Validate before packaging
  console.error("Validating skill...");
  const [valid, message] = validateSkill(resolvedSkillPath);
  if (!valid) {
    console.error(`Validation failed: ${message}`);
    console.error("   Fix validation errors before packaging.");
    return null;
  }
  console.error(`${message}\n`);

  // Determine output location
  const skillName = basename(resolvedSkillPath);
  let outputPath: string;
  if (outputDir) {
    outputPath = resolve(outputDir);
    await Deno.mkdir(outputPath, { recursive: true });
  } else {
    outputPath = Deno.cwd();
  }

  const skillFilename = join(outputPath, `${skillName}.skill`);

  // Create .skill file using zip -r
  // The Python version archives with paths relative to skill_path.parent,
  // so the zip contains <skill-name>/... as the top-level directory.
  try {
    const parentDir = resolve(resolvedSkillPath, "..");
    const dirName = basename(resolvedSkillPath);

    const cmd = new Deno.Command("zip", {
      args: ["-r", skillFilename, dirName],
      cwd: parentDir,
      stdout: "piped",
      stderr: "piped",
    });

    const output = await cmd.output();

    if (!output.success) {
      const stderr = new TextDecoder().decode(output.stderr);
      console.error(
        `Error creating .skill file: zip command failed: ${stderr}`,
      );
      return null;
    }

    // Print added files to match Python behavior
    const stdout = new TextDecoder().decode(output.stdout);
    // zip -r output lines like "  adding: dir/file (deflated 42%)"
    // Python prints "  Added: skill-name/file"
    for (const line of stdout.split("\n")) {
      const addMatch = line.match(/^\s*adding:\s+(.+?)\s+\(/);
      if (addMatch) {
        const arcname = addMatch[1];
        // Only print files, not directories (directories end with /)
        if (!arcname.endsWith("/")) {
          console.error(`  Added: ${arcname}`);
        }
      }
    }

    console.error(`\nPackaged skill to: ${skillFilename}`);
    return skillFilename;
  } catch (e) {
    console.error(`Error creating .skill file: ${e}`);
    return null;
  }
}

async function main(): Promise<void> {
  if (Deno.args.length < 1) {
    console.error(
      "Usage: deno run --allow-read --allow-write scripts/package_skill.ts <path/to/skill-folder> [output-directory]",
    );
    console.error("\nExample:");
    console.error(
      "  deno run --allow-read --allow-write scripts/package_skill.ts .cursor/skills/code-review",
    );
    console.error(
      "  deno run --allow-read --allow-write scripts/package_skill.ts .cursor/skills/code-review ./dist",
    );
    Deno.exit(1);
  }

  const skillPath = Deno.args[0];
  const outputDir = Deno.args.length > 1 ? Deno.args[1] : null;

  console.error(`Packaging skill: ${skillPath}`);
  if (outputDir) {
    console.error(`   Output directory: ${outputDir}`);
  }
  console.error();

  const result = await packageSkill(skillPath, outputDir);
  if (result) {
    console.log(JSON.stringify({ ok: true, result: { archive: result } }));
    Deno.exit(0);
  } else {
    console.log(
      JSON.stringify({ ok: false, error: "Skill packaging failed" }),
    );
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}
