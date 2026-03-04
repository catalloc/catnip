import { assertEquals, assert } from "../../test/assert.ts";
import { timingSafeEqual, secureRandomIndex } from "./crypto.ts";

// --- timingSafeEqual ---

Deno.test("timingSafeEqual: identical strings return true", async () => {
  assertEquals(await timingSafeEqual("secret123", "secret123"), true);
});

Deno.test("timingSafeEqual: different strings return false", async () => {
  assertEquals(await timingSafeEqual("secret123", "wrong456"), false);
});

Deno.test("timingSafeEqual: empty strings return true", async () => {
  assertEquals(await timingSafeEqual("", ""), true);
});

Deno.test("timingSafeEqual: different lengths return false", async () => {
  assertEquals(await timingSafeEqual("short", "much-longer-string"), false);
});

Deno.test("timingSafeEqual: single char difference returns false", async () => {
  assertEquals(await timingSafeEqual("abcdef", "abcdeg"), false);
});

// --- secureRandomIndex ---

Deno.test("secureRandomIndex: returns 0 for max <= 0", () => {
  assertEquals(secureRandomIndex(0), 0);
  assertEquals(secureRandomIndex(-5), 0);
});

Deno.test("secureRandomIndex: returns 0 for max = 1", () => {
  assertEquals(secureRandomIndex(1), 0);
});

Deno.test("secureRandomIndex: result is within bounds", () => {
  for (let i = 0; i < 100; i++) {
    const idx = secureRandomIndex(10);
    assert(idx >= 0 && idx < 10, `Expected 0 <= ${idx} < 10`);
  }
});

Deno.test("secureRandomIndex: large max stays in bounds", () => {
  const max = 1_000_000;
  for (let i = 0; i < 50; i++) {
    const idx = secureRandomIndex(max);
    assert(idx >= 0 && idx < max, `Expected 0 <= ${idx} < ${max}`);
  }
});

Deno.test("secureRandomIndex: produces varied output", () => {
  const results = new Set<number>();
  for (let i = 0; i < 50; i++) {
    results.add(secureRandomIndex(100));
  }
  // With 50 draws from [0,100), extremely unlikely to get < 5 distinct values
  assert(results.size > 5, `Expected variety, got only ${results.size} distinct values`);
});
