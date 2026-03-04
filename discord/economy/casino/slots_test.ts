import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { playSlots } from "./slots.ts";

Deno.test("slots: returns valid result", () => {
  const result = playSlots(100);
  assertEquals(result.reels.length, 3);
  assert(result.multiplier >= 0);
  if (result.won) {
    assert(result.payout > 0);
  } else {
    assertEquals(result.payout, 0);
  }
});

Deno.test("slots: payout is floored", () => {
  // Run multiple times to get a variety of outcomes
  for (let i = 0; i < 20; i++) {
    const result = playSlots(7);
    assertEquals(result.payout, Math.floor(result.payout));
  }
});
