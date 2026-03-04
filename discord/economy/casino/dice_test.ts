import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { playDice } from "./dice.ts";

Deno.test("dice: returns valid result", () => {
  const result = playDice(100, 3);
  assertEquals(result.choice, 3);
  assert(result.rolled >= 1 && result.rolled <= 6);
  if (result.won) {
    assertEquals(result.payout, 500);
    assertEquals(result.rolled, 3);
  } else {
    assertEquals(result.payout, 0);
  }
});
