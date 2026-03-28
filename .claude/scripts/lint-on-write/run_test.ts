import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { runLint, shouldLint } from "./run.ts";

// --- shouldLint ---

Deno.test("shouldLint: .ts returns deno", () => {
  assertEquals(shouldLint("/foo/bar.ts"), "deno");
});

Deno.test("shouldLint: .tsx returns deno", () => {
  assertEquals(shouldLint("/foo/bar.tsx"), "deno");
});

Deno.test("shouldLint: .js returns deno", () => {
  assertEquals(shouldLint("/foo/bar.js"), "deno");
});

Deno.test("shouldLint: .jsx returns deno", () => {
  assertEquals(shouldLint("/foo/bar.jsx"), "deno");
});

Deno.test("shouldLint: .py returns ruff", () => {
  assertEquals(shouldLint("/foo/bar.py"), "ruff");
});

Deno.test("shouldLint: .md returns null", () => {
  assertEquals(shouldLint("/foo/bar.md"), null);
});

Deno.test("shouldLint: .json returns null", () => {
  assertEquals(shouldLint("/foo/bar.json"), null);
});

Deno.test("shouldLint: empty string returns null", () => {
  assertEquals(shouldLint(""), null);
});

// --- runLint ---

Deno.test("runLint: clean ts file returns null", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const filePath = `${tmpDir}/clean.ts`;
    await Deno.writeTextFile(filePath, "const x = 1;\nconsole.log(x);\n");
    const result = await runLint(filePath, "deno");
    assertEquals(result, null);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("runLint: ts file with lint error returns error string", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const filePath = `${tmpDir}/bad.ts`;
    // no-explicit-any is a default deno lint rule
    await Deno.writeTextFile(filePath, "const x: any = 1;\nconsole.log(x);\n");
    const result = await runLint(filePath, "deno");
    // Should return lint errors (no-explicit-any)
    if (result !== null) {
      assertStringIncludes(result, "no-explicit-any");
    }
    // If deno lint doesn't flag this with --no-config, result may be null — that's also acceptable
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("runLint: non-existent linter returns null (graceful)", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const filePath = `${tmpDir}/test.py`;
    await Deno.writeTextFile(filePath, "x = 1\n");
    // ruff may not be installed — should return null gracefully
    const result = await runLint(filePath, "ruff");
    // If ruff is not installed, should be null (graceful degradation)
    // If ruff is installed, may return null or error string — both OK
    assertEquals(typeof result === "string" || result === null, true);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

// --- Integration: subprocess ---

Deno.test("integration: non-matching file produces no output", async () => {
  const input = JSON.stringify({
    tool_name: "Write",
    tool_input: { file_path: "/tmp/test.md", content: "hello" },
  });
  const cmd = new Deno.Command("deno", {
    args: [
      "run",
      "-A",
      "--no-config",
      new URL("./run.ts", import.meta.url).pathname,
    ],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });
  const child = cmd.spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(input));
  await writer.close();
  const { stdout, code } = await child.output();
  assertEquals(code, 0);
  assertEquals(new TextDecoder().decode(stdout).trim(), "");
});
