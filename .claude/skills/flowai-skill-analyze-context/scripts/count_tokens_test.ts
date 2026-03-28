import { assertEquals } from "jsr:@std/assert";
import { countTokens } from "./count_tokens.ts";

Deno.test("countTokens: empty string returns zeros", () => {
  const result = countTokens("");
  assertEquals(result.characters, 0);
  assertEquals(result.estimated_tokens, 0);
});

Deno.test("countTokens: simple text returns correct estimates", () => {
  const text = "Hello, World!"; // 13 chars
  const result = countTokens(text);
  assertEquals(result.characters, 13);
  assertEquals(result.estimated_tokens, Math.floor(13 * 0.3)); // 3
});

Deno.test("countTokens: long text uses 0.3 multiplier", () => {
  const text = "a".repeat(1000);
  const result = countTokens(text);
  assertEquals(result.characters, 1000);
  assertEquals(result.estimated_tokens, 300);
});

Deno.test("countTokens: CLI outputs valid JSON", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--allow-read",
      import.meta.dirname + "/count_tokens.ts",
      "test input",
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const output = await cmd.output();
  assertEquals(output.code, 0);

  const json = JSON.parse(new TextDecoder().decode(output.stdout));
  assertEquals(json.ok, true);
  assertEquals(json.result.characters, 10); // "test input"
  assertEquals(json.result.estimated_tokens, 3);
});
