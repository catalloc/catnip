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

Deno.test("slots: three matching reels gives multiplier > 1.5", () => {
  // Run many times to eventually get a three-of-a-kind
  let gotTriple = false;
  for (let i = 0; i < 500; i++) {
    const result = playSlots(100);
    if (result.reels[0] === result.reels[1] && result.reels[1] === result.reels[2]) {
      assert(result.multiplier >= 1.5, `Triple ${result.reels[0]} should have multiplier >= 1.5`);
      assert(result.won, "Triple should be a win");
      gotTriple = true;
      break;
    }
  }
  assert(gotTriple, "Should get at least one triple in 500 spins");
});

Deno.test("slots: two adjacent matching gives 1.5x", () => {
  // Run many times to find a two-adjacent match (not three-of-a-kind)
  let gotTwoMatch = false;
  for (let i = 0; i < 500; i++) {
    const result = playSlots(100);
    const [a, b, c] = result.reels;
    if ((a === b || b === c) && !(a === b && b === c)) {
      assertEquals(result.multiplier, 1.5);
      gotTwoMatch = true;
      break;
    }
  }
  assert(gotTwoMatch, "Should get at least one two-adjacent match in 500 spins");
});

Deno.test("slots: no matching gives 0 payout", () => {
  // Run many times to find a no-match
  let gotNoMatch = false;
  for (let i = 0; i < 500; i++) {
    const result = playSlots(100);
    const [a, b, c] = result.reels;
    if (a !== b && b !== c) {
      assertEquals(result.multiplier, 0);
      assertEquals(result.payout, 0);
      assertEquals(result.won, false);
      gotNoMatch = true;
      break;
    }
  }
  assert(gotNoMatch, "Should get at least one no-match in 500 spins");
});
