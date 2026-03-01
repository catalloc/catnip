import "../../../test/_mocks/env.ts";
import { assertEquals, assertNotStrictEquals } from "@std/assert";
import { giveawayKey, pickWinners } from "./giveaway.ts";

Deno.test("giveawayKey: returns correct key", () => {
  assertEquals(giveawayKey("guild1"), "giveaway:guild1");
});

Deno.test("pickWinners: empty entrants returns empty", () => {
  assertEquals(pickWinners([], 3), []);
});

Deno.test("pickWinners: returns correct count", () => {
  const entrants = ["a", "b", "c", "d", "e"];
  const winners = pickWinners(entrants, 2);
  assertEquals(winners.length, 2);
});

Deno.test("pickWinners: no duplicates", () => {
  const entrants = ["a", "b", "c", "d", "e"];
  const winners = pickWinners(entrants, 4);
  const unique = new Set(winners);
  assertEquals(unique.size, winners.length);
});

Deno.test("pickWinners: caps at entrants length", () => {
  const entrants = ["a", "b"];
  const winners = pickWinners(entrants, 10);
  assertEquals(winners.length, 2);
});

Deno.test("pickWinners: does not mutate input array", () => {
  const entrants = ["a", "b", "c"];
  const copy = [...entrants];
  pickWinners(entrants, 2);
  assertEquals(entrants, copy);
});

Deno.test("pickWinners: all winners come from entrants", () => {
  const entrants = ["a", "b", "c", "d"];
  const winners = pickWinners(entrants, 3);
  for (const w of winners) {
    assertEquals(entrants.includes(w), true);
  }
});
