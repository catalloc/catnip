import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { playRoulette } from "./roulette.ts";

Deno.test("roulette: color bet returns valid result", () => {
  const result = playRoulette(100, "red", 0);
  assertEquals(result.betType, "red");
  assert(result.landed >= 0 && result.landed <= 36);
  if (result.won) {
    assertEquals(result.payout, 200);
    assertEquals(result.landedColor, "red");
  } else {
    assertEquals(result.payout, 0);
  }
});

Deno.test("roulette: number bet returns valid result", () => {
  const result = playRoulette(100, "number", 17);
  assertEquals(result.betType, "number");
  assertEquals(result.betValue, "17");
  if (result.won) {
    assertEquals(result.payout, 3600);
    assertEquals(result.landed, 17);
  }
});

Deno.test("roulette: landed color is correct", () => {
  for (let i = 0; i < 50; i++) {
    const result = playRoulette(10, "red", 0);
    if (result.landed === 0) {
      assertEquals(result.landedColor, "green");
    } else {
      assert(result.landedColor === "red" || result.landedColor === "black");
    }
  }
});
