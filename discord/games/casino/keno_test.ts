import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { playKeno, parseKenoNumbers, getMultiplier, KENO_POOL, KENO_DRAW_COUNT, KENO_MAX_PICKS } from "./keno.ts";

Deno.test("keno: returns valid result", () => {
  const result = playKeno(100, [5, 10, 15]);
  assertEquals(result.picks.length, 3);
  assertEquals(result.drawn.length, KENO_DRAW_COUNT);
  assert(result.hitCount >= 0 && result.hitCount <= 3);
  assertEquals(result.hits.length, result.hitCount);
});

Deno.test("keno: drawn numbers are unique and in range", () => {
  const result = playKeno(100, [1]);
  const drawnSet = new Set(result.drawn);
  assertEquals(drawnSet.size, KENO_DRAW_COUNT);
  for (const n of result.drawn) {
    assert(n >= 1 && n <= KENO_POOL);
  }
});

Deno.test("keno: hits are subset of picks and drawn", () => {
  const result = playKeno(100, [1, 2, 3, 4, 5]);
  const pickSet = new Set(result.picks);
  const drawnSet = new Set(result.drawn);
  for (const h of result.hits) {
    assert(pickSet.has(h), `Hit ${h} should be in picks`);
    assert(drawnSet.has(h), `Hit ${h} should be in drawn`);
  }
});

Deno.test("keno: getMultiplier returns expected values", () => {
  assertEquals(getMultiplier(1, 0), 0);
  assertEquals(getMultiplier(1, 1), 3.5);
  assertEquals(getMultiplier(10, 10), 5000);
  assertEquals(getMultiplier(5, 3), 3);
});

Deno.test("parseKenoNumbers: valid input", () => {
  const result = parseKenoNumbers("1,5,10,20");
  assertEquals(result.numbers, [1, 5, 10, 20]);
  assertEquals(result.error, undefined);
});

Deno.test("parseKenoNumbers: space-separated", () => {
  const result = parseKenoNumbers("1 5 10");
  assertEquals(result.numbers, [1, 5, 10]);
});

Deno.test("parseKenoNumbers: rejects out of range", () => {
  const result = parseKenoNumbers("0,5");
  assert(result.error !== undefined);
});

Deno.test("parseKenoNumbers: rejects > 40", () => {
  const result = parseKenoNumbers("41");
  assert(result.error !== undefined);
});

Deno.test("parseKenoNumbers: rejects duplicates", () => {
  const result = parseKenoNumbers("5,5");
  assert(result.error !== undefined);
});

Deno.test("parseKenoNumbers: rejects too many picks", () => {
  const result = parseKenoNumbers("1,2,3,4,5,6,7,8,9,10,11");
  assert(result.error !== undefined);
});

Deno.test("parseKenoNumbers: rejects empty", () => {
  const result = parseKenoNumbers("");
  assert(result.error !== undefined);
});

Deno.test("keno: payout matches multiplier * bet", () => {
  const result = playKeno(100, [1, 2, 3]);
  const expectedPayout = Math.floor(100 * getMultiplier(3, result.hitCount));
  assertEquals(result.payout, expectedPayout);
});
