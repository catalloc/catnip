import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { playLimbo } from "./limbo.ts";

Deno.test("limbo: returns valid result structure", () => {
  const result = playLimbo(100, 2.0);
  assertEquals(typeof result.won, "boolean");
  assertEquals(typeof result.rolled, "number");
  assertEquals(result.target, 2.0);
  if (result.won) {
    assertEquals(result.payout, 200);
  } else {
    assertEquals(result.payout, 0);
  }
});

Deno.test("limbo: high target rarely wins", () => {
  let wins = 0;
  for (let i = 0; i < 100; i++) {
    if (playLimbo(100, 50).won) wins++;
  }
  assert(wins < 20, `High target should rarely win, got ${wins}/100`);
});

Deno.test("limbo: low target often wins", () => {
  let wins = 0;
  for (let i = 0; i < 100; i++) {
    if (playLimbo(100, 1.1).won) wins++;
  }
  assert(wins > 50, `Low target should often win, got ${wins}/100`);
});

Deno.test("limbo: payout matches target multiplier", () => {
  for (let i = 0; i < 50; i++) {
    const result = playLimbo(100, 3.0);
    if (result.won) {
      assertEquals(result.payout, 300);
      break;
    }
  }
});

Deno.test("limbo: rolled value is always positive", () => {
  for (let i = 0; i < 50; i++) {
    const result = playLimbo(100, 2.0);
    assert(result.rolled > 0, "Rolled should be positive");
    assert(result.rolled <= 100, "Rolled should be capped at 100");
  }
});
