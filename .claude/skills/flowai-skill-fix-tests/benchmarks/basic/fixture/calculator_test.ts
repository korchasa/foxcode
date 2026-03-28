import { assertEquals, assertThrows } from "@std/assert";
import { add, divide, multiply, subtract } from "./calculator.ts";

Deno.test("add returns sum of two numbers", () => {
  assertEquals(add(2, 3), 5);
});

Deno.test("subtract returns difference", () => {
  assertEquals(subtract(5, 3), 2);
});

Deno.test("multiply returns product", () => {
  assertEquals(multiply(3, 4), 12);
});

Deno.test("divide returns quotient", () => {
  assertEquals(divide(10, 2), 5);
});

Deno.test("divide by zero throws an error", () => {
  assertThrows(
    () => divide(10, 0),
    Error,
    "Cannot divide by zero",
  );
});
