import "../../../test/_mocks/env.ts";
import { assertEquals } from "../../../test/assert.ts";
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
