import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { playCoinflip } from "./coinflip.ts";

Deno.test("coinflip: returns valid result", () => {
  const result = playCoinflip(100, "heads");
  assertEquals(typeof result.won, "boolean");
  assertEquals(result.choice, "heads");
  if (result.won) {
    assertEquals(result.payout, 200);
    assertEquals(result.result, "heads");
  } else {
    assertEquals(result.payout, 0);
    assertEquals(result.result, "tails");
  }
});

Deno.test("coinflip: tails choice", () => {
  const result = playCoinflip(50, "tails");
  assertEquals(result.choice, "tails");
  if (result.won) {
    assertEquals(result.payout, 100);
  }
});

Deno.test("coinflip: output always has won boolean and payout number", () => {
  for (let i = 0; i < 20; i++) {
    const result = playCoinflip(100, "heads");
    assertEquals(typeof result.won, "boolean");
    assertEquals(typeof result.payout, "number");
    assert(result.result === "heads" || result.result === "tails");
  }
});

Deno.test("coinflip: result is always heads or tails", () => {
  const results = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const result = playCoinflip(10, "heads");
    results.add(result.result);
  }
  assert(results.has("heads"), "Should get heads at least once in 100 flips");
  assert(results.has("tails"), "Should get tails at least once in 100 flips");
});
