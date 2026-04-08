#!/usr/bin/env -S deno run -A
/**
 * Rule Initializer - Creates a new rule from template for the target IDE.
 *
 * Usage:
 *     deno run -A init_rule.ts <rule-name> --ide <cursor|claude|opencode> --path <path> [--always-apply] [--globs PATTERN]
 *
 * Examples:
 *     deno run -A init_rule.ts typescript-standards --ide cursor --path .cursor/rules --globs "**\/*.ts"
 *     deno run -A init_rule.ts coding-standards --ide cursor --path .cursor/rules --always-apply
 *     deno run -A init_rule.ts typescript-standards --ide claude --path .claude/rules --globs "src/**\/*.ts"
 *     deno run -A init_rule.ts project-rules --ide opencode --path .opencode
 *     deno run -A init_rule.ts project-rules --ide opencode --path .
 */

import { parseArgs } from "jsr:@std/cli/parse-args";
import { join, resolve } from "jsr:@std/path";

const CURSOR_TEMPLATE_CONDITIONAL = `---
description: {description}
globs: "{globs}"
alwaysApply: false
---

# {title}

[TODO: Add rule content here. Include concrete code examples.]

`;

const CURSOR_TEMPLATE_ALWAYS = `---
description: {description}
alwaysApply: true
---

# {title}

[TODO: Add rule content here. Include concrete code examples.]

`;

const CLAUDE_TEMPLATE_CONDITIONAL = `---
paths:
  - "{globs}"
---

# {title}

[TODO: Add rule content here. Include concrete code examples.]

`;

const CLAUDE_TEMPLATE_ALWAYS = `# {title}

[TODO: Add rule content here. Include concrete code examples.]

`;

const OPENCODE_AGENTS_TEMPLATE = `# {title}

[TODO: Add rule content here. Include concrete code examples.]
`;

function titleCase(name: string): string {
  return name.split("-").map((word) =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(" ");
}

function formatTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}

export function initRule(
  ruleName: string,
  ide: string,
  path: string,
  alwaysApply = false,
  globs?: string,
  options?: { skipExisting?: boolean },
): string | null {
  const resolvedPath = resolve(path);
  const title = titleCase(ruleName);
  const description = "[TODO: Describe what this rule enforces]";

  if (ide === "cursor") {
    const ruleDir = join(resolvedPath, ruleName);
    try {
      const stat = Deno.statSync(ruleDir);
      if (stat.isDirectory || stat.isFile) {
        if (options?.skipExisting) {
          console.error(
            `Warning: Rule directory already exists, skipping: ${ruleDir}`,
          );
          return join(ruleDir, "RULE.md");
        }
        console.error(`Error: Rule directory already exists: ${ruleDir}`);
        console.error("Use --skip-existing to skip existing targets.");
        return null;
      }
    } catch {
      // Does not exist, proceed
    }

    Deno.mkdirSync(ruleDir, { recursive: true });

    let content: string;
    if (alwaysApply) {
      content = formatTemplate(CURSOR_TEMPLATE_ALWAYS, { description, title });
    } else {
      content = formatTemplate(CURSOR_TEMPLATE_CONDITIONAL, {
        description,
        title,
        globs: globs || "**/*",
      });
    }

    const ruleFile = join(ruleDir, "RULE.md");
    Deno.writeTextFileSync(ruleFile, content);
    console.error(`Created ${ruleFile}`);
    return ruleFile;
  } else if (ide === "claude") {
    Deno.mkdirSync(resolvedPath, { recursive: true });

    let content: string;
    if (alwaysApply && !globs) {
      content = formatTemplate(CLAUDE_TEMPLATE_ALWAYS, { title });
    } else {
      content = formatTemplate(CLAUDE_TEMPLATE_CONDITIONAL, {
        description,
        title,
        globs: globs || "**/*",
      });
    }

    const ruleFile = join(resolvedPath, `${ruleName}.md`);
    try {
      Deno.statSync(ruleFile);
      if (options?.skipExisting) {
        console.error(
          `Warning: Rule file already exists, skipping: ${ruleFile}`,
        );
        return ruleFile;
      }
      console.error(`Error: Rule file already exists: ${ruleFile}`);
      console.error("Use --skip-existing to skip existing targets.");
      return null;
    } catch {
      // Does not exist, proceed
    }

    Deno.writeTextFileSync(ruleFile, content);
    console.error(`Created ${ruleFile}`);
    return ruleFile;
  } else if (ide === "opencode") {
    Deno.mkdirSync(resolvedPath, { recursive: true });
    const content = formatTemplate(OPENCODE_AGENTS_TEMPLATE, { title });

    const ruleFile = join(resolvedPath, "AGENTS.md");
    try {
      Deno.statSync(ruleFile);
      if (options?.skipExisting) {
        console.error(
          `Warning: AGENTS.md already exists, skipping: ${ruleFile}`,
        );
        return ruleFile;
      }
      console.error(`Error: AGENTS.md already exists: ${ruleFile}`);
      console.error("Use --skip-existing to skip existing targets.");
      return null;
    } catch {
      // Does not exist, proceed
    }

    Deno.writeTextFileSync(ruleFile, content);
    console.error(`Created ${ruleFile}`);
    return ruleFile;
  } else {
    console.error(`Error: Unknown IDE '${ide}'`);
    return null;
  }
}

function main(): void {
  const args = parseArgs(Deno.args, {
    string: ["ide", "path", "globs"],
    boolean: ["always-apply", "skip-existing"],
    default: {
      "always-apply": false,
      "skip-existing": false,
    },
  });

  const ruleName = args._[0] as string | undefined;
  if (!ruleName) {
    console.error("Error: rule_name is required");
    Deno.exit(1);
  }

  const ide = args.ide;
  if (
    !ide ||
    !["cursor", "claude", "opencode"].includes(ide)
  ) {
    console.error(
      "Error: --ide is required and must be one of: cursor, claude, opencode",
    );
    Deno.exit(1);
  }

  const path = args.path;
  if (!path) {
    console.error("Error: --path is required");
    Deno.exit(1);
  }

  const alwaysApply = args["always-apply"];
  const skipExisting = args["skip-existing"];
  const globs = args.globs;

  console.error(`Initializing rule: ${ruleName}`);
  console.error(`   IDE: ${ide}`);
  console.error(`   Location: ${path}`);
  if (alwaysApply) {
    console.error("   Scope: always apply");
  } else if (globs) {
    console.error(`   Scope: ${globs}`);
  }
  console.error();

  const result = initRule(ruleName, ide, path, alwaysApply, globs, {
    skipExisting,
  });

  if (result) {
    console.error(`\nRule initialized. Edit the file to complete TODO items.`);
    console.log(JSON.stringify({ ok: true, result: { path: result } }));
    Deno.exit(0);
  } else {
    console.log(
      JSON.stringify({ ok: false, error: "Rule initialization failed" }),
    );
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}
