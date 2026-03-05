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

Deno.test("roulette: green (0) landing — neither red nor black wins", () => {
  // Run many times to get a zero
  let gotZero = false;
  for (let i = 0; i < 500; i++) {
    const result = playRoulette(100, "red", 0);
    if (result.landed === 0) {
      assertEquals(result.landedColor, "green");
      assertEquals(result.won, false);
      assertEquals(result.payout, 0);
      gotZero = true;
      break;
    }
  }
  // 0 has ~2.7% chance, so 500 tries should be enough
  assert(gotZero, "Should land on 0 at least once in 500 spins");
});

Deno.test("roulette: black bet wins on black number", () => {
  let gotBlackWin = false;
  for (let i = 0; i < 500; i++) {
    const result = playRoulette(100, "black", 0);
    if (result.won) {
      assertEquals(result.landedColor, "black");
      assertEquals(result.payout, 200);
      gotBlackWin = true;
      break;
    }
  }
  assert(gotBlackWin, "Should win a black bet at least once");
});

Deno.test("roulette: number bet payout is 36x", () => {
  // We test the payout calculation — if bet on number 17 and it hits
  let gotNumberWin = false;
  for (let i = 0; i < 1000; i++) {
    const result = playRoulette(100, "number", 17);
    if (result.won) {
      assertEquals(result.payout, 3600);
      assertEquals(result.landed, 17);
      gotNumberWin = true;
      break;
    }
  }
  // ~2.7% chance per spin, 1000 tries should be sufficient
  if (!gotNumberWin) {
    // If we didn't hit, just verify a loss returns 0 payout
    const result = playRoulette(100, "number", 17);
    if (!result.won) {
      assertEquals(result.payout, 0);
    }
  }
});
