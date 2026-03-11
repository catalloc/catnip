import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { playPlinko, _internals } from "./plinko.ts";

Deno.test("plinko: returns valid result for low risk", () => {
  const result = playPlinko(100, "low");
  assertEquals(result.risk, "low");
  assertEquals(result.path.length, _internals.ROWS);
  assert(result.slot >= 0 && result.slot <= 8, "Slot should be 0-8");
  assert(result.multiplier >= 0, "Multiplier should be non-negative");
  assertEquals(result.payout, Math.floor(100 * result.multiplier));
});

Deno.test("plinko: medium risk has correct multipliers", () => {
  const mults = _internals.MULTIPLIERS.medium;
  assertEquals(mults.length, 9);
  assertEquals(mults[0], 3.0);
  assertEquals(mults[4], 0.2);
  assertEquals(mults[8], 3.0);
});

Deno.test("plinko: high risk has higher extremes", () => {
  const mults = _internals.MULTIPLIERS.high;
  assertEquals(mults[0], 10.0);
  assertEquals(mults[4], 0.1);
});

Deno.test("plinko: path contains only L and R", () => {
  for (let i = 0; i < 20; i++) {
    const result = playPlinko(100, "low");
    for (const dir of result.path) {
      assert(dir === "L" || dir === "R");
    }
  }
});

Deno.test("plinko: slot is determined by path", () => {
  const result = playPlinko(100, "low");
  const expectedSlot = result.path.filter((d) => d === "R").length;
  assertEquals(result.slot, expectedSlot);
});

Deno.test("plinko: won is true when payout > 0", () => {
  for (let i = 0; i < 50; i++) {
    const result = playPlinko(100, "medium");
    assertEquals(result.won, result.payout > 0);
  }
});
