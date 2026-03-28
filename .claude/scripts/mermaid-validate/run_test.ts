import { assertEquals } from "jsr:@std/assert";
import { hasMermaidBlocks, isMermaidExt } from "./run.ts";

// --- isMermaidExt ---

Deno.test("isMermaidExt: .mmd returns true", () => {
  assertEquals(isMermaidExt("/foo/diagram.mmd"), true);
});

Deno.test("isMermaidExt: .md returns true", () => {
  assertEquals(isMermaidExt("/foo/readme.md"), true);
});

Deno.test("isMermaidExt: .txt returns false", () => {
  assertEquals(isMermaidExt("/foo/file.txt"), false);
});

Deno.test("isMermaidExt: .ts returns false", () => {
  assertEquals(isMermaidExt("/foo/file.ts"), false);
});

Deno.test("isMermaidExt: empty string returns false", () => {
  assertEquals(isMermaidExt(""), false);
});

// --- hasMermaidBlocks ---

Deno.test("hasMermaidBlocks: content with mermaid block returns true", () => {
  const content = "# Title\n\n```mermaid\ngraph TD\n  A-->B\n```\n";
  assertEquals(hasMermaidBlocks(content), true);
});

Deno.test("hasMermaidBlocks: content without mermaid returns false", () => {
  assertEquals(hasMermaidBlocks("# Just a heading\nSome text.\n"), false);
});

Deno.test("hasMermaidBlocks: empty string returns false", () => {
  assertEquals(hasMermaidBlocks(""), false);
});

Deno.test("hasMermaidBlocks: code block but not mermaid returns false", () => {
  assertEquals(hasMermaidBlocks("```typescript\nconst x = 1;\n```\n"), false);
});

// --- Integration ---

Deno.test("integration: .txt file produces no output", async () => {
  const input = JSON.stringify({
    tool_name: "Write",
    tool_input: { file_path: "/tmp/test.txt", content: "hello" },
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
