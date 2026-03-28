/**
 * Token estimation script.
 * Estimates token count from text using character-based heuristic.
 * Multiplier: 0.3 (approx 3.3 chars per token).
 *
 * Usage: deno run scripts/count_tokens.ts "text to count"
 * Or pipe via stdin: echo "text" | deno run scripts/count_tokens.ts
 *
 * Output (stdout): JSON { "ok": true, "result": { "characters": N, "estimated_tokens": N } }
 * Diagnostics: stderr
 */

const MULTIPLIER = 0.3;

export function countTokens(
  text: string,
): { characters: number; estimated_tokens: number } {
  const characters = text.length;
  const estimated_tokens = Math.floor(characters * MULTIPLIER);
  return { characters, estimated_tokens };
}

if (import.meta.main) {
  let text: string;

  if (Deno.args.length > 0) {
    text = Deno.args.join(" ");
  } else {
    try {
      const decoder = new TextDecoder();
      const buf = new Uint8Array(1024 * 1024);
      const chunks: string[] = [];
      let n: number | null;
      while ((n = Deno.stdin.readSync(buf)) !== null) {
        chunks.push(decoder.decode(buf.subarray(0, n)));
      }
      text = chunks.join("");
    } catch {
      text = "";
    }
  }

  const result = countTokens(text);
  console.log(JSON.stringify({ ok: true, result }));
}
