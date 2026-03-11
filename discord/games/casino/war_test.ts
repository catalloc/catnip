import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { playWar, formatWarCard } from "./war.ts";

Deno.test("war: returns valid result", () => {
  const result = playWar(100);
  assert(result.rounds.length >= 1, "Should have at least 1 round");
  assert(result.rounds.length <= 3, "Should have at most 3 rounds");
  assertEquals(typeof result.won, "boolean");
  assertEquals(typeof result.payout, "number");
  assert(result.totalBet >= 100, "Total bet should be at least initial bet");
});

Deno.test("war: winning first round gives 2x", () => {
  for (let i = 0; i < 100; i++) {
    const result = playWar(100);
    if (result.rounds.length === 1 && result.won) {
      assertEquals(result.payout, 200);
      return;
    }
  }
});

Deno.test("war: losing first round gives 0", () => {
  for (let i = 0; i < 100; i++) {
    const result = playWar(100);
    if (result.rounds.length === 1 && !result.won) {
      assertEquals(result.payout, 0);
      return;
    }
  }
});

Deno.test("war: multiple rounds increase total bet", () => {
  for (let i = 0; i < 200; i++) {
    const result = playWar(100);
    if (result.rounds.length > 1) {
      assert(result.totalBet > 100, "Total bet should increase with war");
      return;
    }
  }
});

Deno.test("war: formatWarCard works", () => {
  const card = { rank: "A", suit: ":spades:", value: 14 };
  assertEquals(formatWarCard(card), "A:spades:");
});

Deno.test("war: cards have valid ranks", () => {
  const validRanks = new Set(["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]);
  for (let i = 0; i < 50; i++) {
    const result = playWar(100);
    for (const round of result.rounds) {
      assert(validRanks.has(round.playerCard.rank));
      assert(validRanks.has(round.dealerCard.rank));
    }
  }
});
