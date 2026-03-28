import { assertEquals } from "jsr:@std/assert";
import { join } from "jsr:@std/path";
import { validateRule } from "./validate_rule.ts";
import { initRule } from "./init_rule.ts";

// ===========================================================================
// validateRule
// ===========================================================================

Deno.test("validate: valid Cursor rule (dir with RULE.md, proper frontmatter)", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const ruleDir = join(tmpDir, ".cursor", "rules", "my-rule");
    Deno.mkdirSync(ruleDir, { recursive: true });
    Deno.writeTextFileSync(
      join(ruleDir, "RULE.md"),
      `---
description: Enforce coding standards
globs: "**/*.ts"
alwaysApply: false
---

# My Rule

Use strict mode everywhere.
`,
    );

    const [valid, msg] = validateRule(ruleDir);
    assertEquals(valid, true, `Expected valid, got: ${msg}`);
  } finally {
    Deno.removeSync(tmpDir, { recursive: true });
  }
});

Deno.test("validate: valid Claude rule (.md file with optional frontmatter)", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const rulesDir = join(tmpDir, ".claude", "rules");
    Deno.mkdirSync(rulesDir, { recursive: true });
    const ruleFile = join(rulesDir, "my-rule.md");
    Deno.writeTextFileSync(
      ruleFile,
      `---
description: Some description
paths: src/**/*.ts
---

# My Claude Rule

Content here.
`,
    );

    const [valid, msg] = validateRule(ruleFile);
    assertEquals(valid, true, `Expected valid, got: ${msg}`);
  } finally {
    Deno.removeSync(tmpDir, { recursive: true });
  }
});

Deno.test("validate: valid OpenCode rule (AGENTS.md with content)", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const opencodeDir = join(tmpDir, ".opencode");
    Deno.mkdirSync(opencodeDir, { recursive: true });
    const agentsFile = join(opencodeDir, "AGENTS.md");
    Deno.writeTextFileSync(agentsFile, "# Project Rules\n\nSome content.\n");

    const [valid, msg] = validateRule(agentsFile);
    assertEquals(valid, true, `Expected valid, got: ${msg}`);
  } finally {
    Deno.removeSync(tmpDir, { recursive: true });
  }
});

Deno.test("validate: missing rule file returns error", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    // Directory exists but no RULE.md inside
    const ruleDir = join(tmpDir, ".cursor", "rules", "missing-rule");
    Deno.mkdirSync(ruleDir, { recursive: true });

    const [valid, _msg] = validateRule(ruleDir);
    assertEquals(valid, false);
  } finally {
    Deno.removeSync(tmpDir, { recursive: true });
  }
});

Deno.test("validate: Cursor rule with unexpected frontmatter key returns error", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const ruleDir = join(tmpDir, ".cursor", "rules", "bad-key");
    Deno.mkdirSync(ruleDir, { recursive: true });
    Deno.writeTextFileSync(
      join(ruleDir, "RULE.md"),
      `---
description: Valid desc
globs: "**/*.ts"
alwaysApply: false
author: someone
---

# Rule

Content.
`,
    );

    const [valid, msg] = validateRule(ruleDir);
    assertEquals(valid, false);
    assertEquals(msg.includes("Unexpected frontmatter key"), true, msg);
  } finally {
    Deno.removeSync(tmpDir, { recursive: true });
  }
});

Deno.test("validate: Cursor rule missing description returns error", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const ruleDir = join(tmpDir, ".cursor", "rules", "no-desc");
    Deno.mkdirSync(ruleDir, { recursive: true });
    Deno.writeTextFileSync(
      join(ruleDir, "RULE.md"),
      `---
globs: "**/*.ts"
alwaysApply: false
---

# Rule

Content.
`,
    );

    const [valid, msg] = validateRule(ruleDir);
    assertEquals(valid, false);
    assertEquals(msg.includes("Missing 'description'"), true, msg);
  } finally {
    Deno.removeSync(tmpDir, { recursive: true });
  }
});

Deno.test("validate: Cursor rule with empty body returns error", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const ruleDir = join(tmpDir, ".cursor", "rules", "empty-body");
    Deno.mkdirSync(ruleDir, { recursive: true });
    Deno.writeTextFileSync(
      join(ruleDir, "RULE.md"),
      `---
description: Valid desc
alwaysApply: true
---
`,
    );

    const [valid, msg] = validateRule(ruleDir);
    assertEquals(valid, false);
    assertEquals(msg.includes("body is empty"), true, msg);
  } finally {
    Deno.removeSync(tmpDir, { recursive: true });
  }
});

Deno.test("validate: Claude rule with unexpected frontmatter key returns error", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const rulesDir = join(tmpDir, ".claude", "rules");
    Deno.mkdirSync(rulesDir, { recursive: true });
    const ruleFile = join(rulesDir, "bad-claude.md");
    Deno.writeTextFileSync(
      ruleFile,
      `---
description: desc
paths: "**/*.ts"
priority: high
---

# Rule

Content.
`,
    );

    const [valid, msg] = validateRule(ruleFile);
    assertEquals(valid, false);
    assertEquals(msg.includes("Unexpected frontmatter key"), true, msg);
  } finally {
    Deno.removeSync(tmpDir, { recursive: true });
  }
});

Deno.test("validate: OpenCode AGENTS.md empty file returns error", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const opencodeDir = join(tmpDir, ".opencode");
    Deno.mkdirSync(opencodeDir, { recursive: true });
    const agentsFile = join(opencodeDir, "AGENTS.md");
    Deno.writeTextFileSync(agentsFile, "");

    const [valid, msg] = validateRule(agentsFile);
    assertEquals(valid, false);
    assertEquals(msg.includes("empty"), true, msg);
  } finally {
    Deno.removeSync(tmpDir, { recursive: true });
  }
});

Deno.test("validate: rule too long (>500 lines) returns error", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const ruleDir = join(tmpDir, ".cursor", "rules", "long-rule");
    Deno.mkdirSync(ruleDir, { recursive: true });

    const lines = [
      "---",
      "description: Long rule",
      "alwaysApply: true",
      "---",
      "",
      "# Long Rule",
      "",
    ];
    // Add enough lines to exceed 500
    for (let i = 0; i < 500; i++) {
      lines.push(`Line ${i}`);
    }
    Deno.writeTextFileSync(join(ruleDir, "RULE.md"), lines.join("\n"));

    const [valid, msg] = validateRule(ruleDir);
    assertEquals(valid, false);
    assertEquals(msg.includes("too long"), true, msg);
  } finally {
    Deno.removeSync(tmpDir, { recursive: true });
  }
});

Deno.test("validate: legacy .mdc format produces deprecation warning", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const rulesDir = join(tmpDir, ".cursor", "rules");
    Deno.mkdirSync(rulesDir, { recursive: true });
    const mdcFile = join(rulesDir, "old-rule.mdc");
    Deno.writeTextFileSync(
      mdcFile,
      `---
description: Legacy rule
alwaysApply: true
---

# Legacy

Content here.
`,
    );

    const [valid, msg] = validateRule(mdcFile);
    // Should be invalid because of deprecation warning in errors list
    assertEquals(valid, false);
    assertEquals(msg.includes("deprecated"), true, msg);
  } finally {
    Deno.removeSync(tmpDir, { recursive: true });
  }
});

Deno.test("validate: opencode.json with valid instructions is valid", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const jsonFile = join(tmpDir, "opencode.json");
    Deno.writeTextFileSync(
      jsonFile,
      JSON.stringify({
        instructions: [
          "Follow coding standards",
          { path: ".opencode/AGENTS.md" },
          { glob: "**/*.ts" },
          { url: "https://example.com/rules" },
        ],
      }),
    );

    const [valid, msg] = validateRule(jsonFile);
    assertEquals(valid, true, `Expected valid, got: ${msg}`);
  } finally {
    Deno.removeSync(tmpDir, { recursive: true });
  }
});

Deno.test("validate: opencode.json with invalid instructions returns error", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const jsonFile = join(tmpDir, "opencode.json");
    Deno.writeTextFileSync(
      jsonFile,
      JSON.stringify({
        instructions: [
          { noValidKey: true },
        ],
      }),
    );

    const [valid, msg] = validateRule(jsonFile);
    assertEquals(valid, false);
    assertEquals(msg.includes("must contain at least one of"), true, msg);
  } finally {
    Deno.removeSync(tmpDir, { recursive: true });
  }
});

// ===========================================================================
// initRule
// ===========================================================================

Deno.test("init: Cursor creates directory with RULE.md (conditional with globs)", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const result = initRule("my-rule", "cursor", tmpDir, false, "**/*.ts");

    assertEquals(result !== null, true, "initRule should return a path");
    const expected = join(tmpDir, "my-rule", "RULE.md");
    assertEquals(result, expected);

    const content = Deno.readTextFileSync(expected);
    assertEquals(content.includes("globs:"), true, "Should contain globs");
    assertEquals(
      content.includes("alwaysApply: false"),
      true,
      "Should have alwaysApply: false",
    );
    assertEquals(
      content.includes("**/*.ts"),
      true,
      "Should contain the glob pattern",
    );
    assertEquals(content.includes("# My Rule"), true, "Should contain title");
  } finally {
    Deno.removeSync(tmpDir, { recursive: true });
  }
});

Deno.test("init: Cursor creates directory with RULE.md (always-apply)", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const result = initRule("always-rule", "cursor", tmpDir, true);

    assertEquals(result !== null, true, "initRule should return a path");
    const expected = join(tmpDir, "always-rule", "RULE.md");
    assertEquals(result, expected);

    const content = Deno.readTextFileSync(expected);
    assertEquals(
      content.includes("alwaysApply: true"),
      true,
      "Should have alwaysApply: true",
    );
    assertEquals(
      content.includes("globs:"),
      false,
      "Always-apply should not have globs",
    );
    assertEquals(
      content.includes("# Always Rule"),
      true,
      "Should contain title",
    );
  } finally {
    Deno.removeSync(tmpDir, { recursive: true });
  }
});

Deno.test("init: Claude creates .md file (conditional)", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const result = initRule(
      "ts-standards",
      "claude",
      tmpDir,
      false,
      "src/**/*.ts",
    );

    assertEquals(result !== null, true, "initRule should return a path");
    const expected = join(tmpDir, "ts-standards.md");
    assertEquals(result, expected);

    const content = Deno.readTextFileSync(expected);
    assertEquals(content.includes("paths:"), true, "Should contain paths");
    assertEquals(
      content.includes("src/**/*.ts"),
      true,
      "Should contain glob pattern",
    );
    assertEquals(
      content.includes("# Ts Standards"),
      true,
      "Should contain title",
    );
  } finally {
    Deno.removeSync(tmpDir, { recursive: true });
  }
});

Deno.test("init: Claude creates .md file (always-apply, no globs)", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const result = initRule("global-rule", "claude", tmpDir, true);

    assertEquals(result !== null, true, "initRule should return a path");
    const expected = join(tmpDir, "global-rule.md");
    assertEquals(result, expected);

    const content = Deno.readTextFileSync(expected);
    // Always-apply Claude rule without globs should have no frontmatter
    assertEquals(
      content.startsWith("---"),
      false,
      "Always-apply Claude rule without globs should have no frontmatter",
    );
    assertEquals(
      content.includes("# Global Rule"),
      true,
      "Should contain title",
    );
  } finally {
    Deno.removeSync(tmpDir, { recursive: true });
  }
});

Deno.test("init: OpenCode creates AGENTS.md", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const result = initRule("project-rules", "opencode", tmpDir);

    assertEquals(result !== null, true, "initRule should return a path");
    const expected = join(tmpDir, "AGENTS.md");
    assertEquals(result, expected);

    const content = Deno.readTextFileSync(expected);
    assertEquals(
      content.includes("# Project Rules"),
      true,
      "Should contain title",
    );
  } finally {
    Deno.removeSync(tmpDir, { recursive: true });
  }
});

Deno.test("init: fails if target already exists", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    // Create the rule first
    const first = initRule("existing-rule", "cursor", tmpDir, true);
    assertEquals(first !== null, true, "First init should succeed");

    // Second attempt should fail
    const second = initRule("existing-rule", "cursor", tmpDir, true);
    assertEquals(second, null, "Should return null when target already exists");
  } finally {
    Deno.removeSync(tmpDir, { recursive: true });
  }
});

Deno.test("init: --skip-existing returns path when target exists (cursor)", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const first = initRule("existing-rule", "cursor", tmpDir, true);
    assertEquals(first !== null, true, "First init should succeed");

    const second = initRule(
      "existing-rule",
      "cursor",
      tmpDir,
      true,
      undefined,
      {
        skipExisting: true,
      },
    );
    assertEquals(typeof second, "string");
    assertEquals(second !== null, true, "--skip-existing should return path");
  } finally {
    Deno.removeSync(tmpDir, { recursive: true });
  }
});

Deno.test("init: --skip-existing returns path when target exists (claude)", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const first = initRule("existing-rule", "claude", tmpDir, true);
    assertEquals(first !== null, true, "First init should succeed");

    const second = initRule(
      "existing-rule",
      "claude",
      tmpDir,
      true,
      undefined,
      {
        skipExisting: true,
      },
    );
    assertEquals(typeof second, "string");
    assertEquals(second !== null, true, "--skip-existing should return path");
  } finally {
    Deno.removeSync(tmpDir, { recursive: true });
  }
});
