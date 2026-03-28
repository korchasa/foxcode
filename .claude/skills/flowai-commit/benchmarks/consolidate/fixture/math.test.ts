import { assertEquals } from "jsr:@std/assert";
import { add } from "./math.ts";

Deno.test("add returns sum of two numbers", () => {
  assertEquals(add(1, 2), 3);
});
