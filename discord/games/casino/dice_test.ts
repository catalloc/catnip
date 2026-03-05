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

Deno.test("dice: rolled value is always 1-6", () => {
  for (let i = 0; i < 50; i++) {
    const result = playDice(100, 1);
    assert(result.rolled >= 1 && result.rolled <= 6);
  }
});

Deno.test("dice: win when choice matches roll", () => {
  // Run enough times to get a win
  let gotWin = false;
  for (let i = 0; i < 100; i++) {
    const result = playDice(100, 4);
    if (result.won) {
      assertEquals(result.rolled, 4);
      assertEquals(result.payout, 500); // 5x
      gotWin = true;
      break;
    }
  }
  assert(gotWin, "Should win at least once in 100 rolls");
});
