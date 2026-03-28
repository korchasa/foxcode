import { assertEquals } from "jsr:@std/assert";
import { validateMermaid } from "./validate.ts";

Deno.test("validateMermaid: returns error for non-existent file", async () => {
  const result = await validateMermaid("/tmp/nonexistent-mermaid-file.mmd");
  assertEquals(result.valid, false);
  assertEquals(result.errors.length, 1);
  assertEquals(
    result.errors[0],
    "File not found: /tmp/nonexistent-mermaid-file.mmd",
  );
});

Deno.test("validateMermaid: result has correct shape", async () => {
  const result = await validateMermaid("/tmp/nonexistent.mmd");
  assertEquals(typeof result.valid, "boolean");
  assertEquals(typeof result.file, "string");
  assertEquals(Array.isArray(result.errors), true);
});
