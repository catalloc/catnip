import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { playHorseRace, HORSES, formatRace, _internals } from "./horserace.ts";

Deno.test("horserace: returns valid result", () => {
  const result = playHorseRace(100, 1);
  assertEquals(result.chosenHorse, 1);
  assert(HORSES.some((h) => h.number === result.winner.number));
  assertEquals(typeof result.won, "boolean");
  assert(result.positions.length > 0, "Should have position data");
});

Deno.test("horserace: winning payout matches horse odds", () => {
  for (let i = 0; i < 100; i++) {
    const result = playHorseRace(100, 1);
    if (result.won) {
      assertEquals(result.payout, Math.floor(100 * HORSES[0].payout));
      return;
    }
  }
});

Deno.test("horserace: all horses can win", () => {
  const winners = new Set<number>();
  for (let i = 0; i < 500; i++) {
    const result = playHorseRace(10, 1);
    winners.add(result.winner.number);
    if (winners.size === 5) break;
  }
  assertEquals(winners.size, 5, "All horses should be able to win");
});

Deno.test("horserace: losing payout is 0", () => {
  for (let i = 0; i < 100; i++) {
    const result = playHorseRace(100, 1);
    if (!result.won) {
      assertEquals(result.payout, 0);
      return;
    }
  }
});

Deno.test("horserace: formatRace produces output", () => {
  const positions = [10, 8, 7, 6, 5];
  const output = formatRace(positions);
  assert(output.length > 0);
  assert(output.includes("`1`"));
  assert(output.includes("`5`"));
});

Deno.test("horserace: HORSES has correct count", () => {
  assertEquals(HORSES.length, 5);
});

Deno.test("horserace: total weight is sum of horse weights", () => {
  const sum = HORSES.reduce((s, h) => s + h.weight, 0);
  assertEquals(_internals.TOTAL_WEIGHT, sum);
});
