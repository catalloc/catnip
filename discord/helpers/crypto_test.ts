import { assertEquals, assert } from "../../test/assert.ts";
import { timingSafeEqual, secureRandomIndex, cryptoJitter } from "./crypto.ts";

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

// --- cryptoJitter ---

Deno.test("cryptoJitter: returns 0 for maxMs <= 0", () => {
  assertEquals(cryptoJitter(0), 0);
  assertEquals(cryptoJitter(-100), 0);
});

Deno.test("cryptoJitter: result is within [0, maxMs)", () => {
  for (let i = 0; i < 100; i++) {
    const val = cryptoJitter(2000);
    assert(val >= 0 && val < 2000, `Expected 0 <= ${val} < 2000`);
  }
});

Deno.test("cryptoJitter: produces varied output", () => {
  const results = new Set<number>();
  for (let i = 0; i < 50; i++) {
    results.add(Math.floor(cryptoJitter(1000)));
  }
  assert(results.size > 5, `Expected variety, got only ${results.size} distinct values`);
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

// --- Security edge case tests ---

Deno.test("timingSafeEqual: single-char equal strings return true", async () => {
  assertEquals(await timingSafeEqual("x", "x"), true);
});

Deno.test("timingSafeEqual: single-char different strings return false", async () => {
  assertEquals(await timingSafeEqual("x", "y"), false);
});

Deno.test("cryptoJitter: small maxMs produces value in range", () => {
  // maxMs=1 means result is in [0, 1), which floors to 0
  const val = cryptoJitter(1);
  assert(val >= 0 && val < 1, `Expected 0 <= ${val} < 1`);
  assertEquals(Math.floor(val), 0);
});
