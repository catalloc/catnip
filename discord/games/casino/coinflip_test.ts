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

// --- Deterministic tests using crypto.getRandomValues mock ---

const origGetRandomValues = crypto.getRandomValues.bind(crypto);
let mockValues: number[] = [];
function mockRandom(...values: number[]) {
  mockValues = [...values];
  crypto.getRandomValues = function <T extends ArrayBufferView>(array: T): T {
    if (array instanceof Uint32Array) {
      array[0] = mockValues.shift() ?? 0;
    }
    return array;
  } as typeof crypto.getRandomValues;
}
function restoreRandom() {
  crypto.getRandomValues = origGetRandomValues;
  mockValues = [];
}

Deno.test("coinflip deterministic: heads win", () => {
  try {
    mockRandom(0);
    const result = playCoinflip(100, "heads");
    assertEquals(result.result, "heads");
    assertEquals(result.choice, "heads");
    assertEquals(result.won, true);
    assertEquals(result.payout, 200);
  } finally {
    restoreRandom();
  }
});

Deno.test("coinflip deterministic: tails win", () => {
  try {
    mockRandom(1);
    const result = playCoinflip(100, "tails");
    assertEquals(result.result, "tails");
    assertEquals(result.choice, "tails");
    assertEquals(result.won, true);
    assertEquals(result.payout, 200);
  } finally {
    restoreRandom();
  }
});

Deno.test("coinflip deterministic: loss", () => {
  try {
    mockRandom(1);
    const result = playCoinflip(100, "heads");
    assertEquals(result.result, "tails");
    assertEquals(result.choice, "heads");
    assertEquals(result.won, false);
    assertEquals(result.payout, 0);
  } finally {
    restoreRandom();
  }
});
