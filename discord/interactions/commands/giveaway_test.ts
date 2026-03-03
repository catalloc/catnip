import "../../../test/_mocks/env.ts";
import { assertEquals, assert, assertNotStrictEquals } from "@std/assert";
import { sqlite } from "https://esm.town/v/std/sqlite/main.ts";
import { kv } from "../../persistence/kv.ts";
import { mockFetch, restoreFetch } from "../../../test/_mocks/fetch.ts";
import giveawayCommand, { giveawayKey, pickWinners, type GiveawayConfig } from "./giveaway.ts";

function resetStore() {
  (sqlite as any)._reset();
}

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

// --- Reroll CAS failure ---

Deno.test("giveaway reroll: CAS failure returns user-facing error", async () => {
  resetStore();
  const guildId = "g1";

  // Set up an ended giveaway
  await kv.set(giveawayKey(guildId), {
    prize: "Test Prize",
    channelId: "c1",
    messageId: "m1",
    endsAt: Date.now() - 1000,
    winnersCount: 1,
    entrants: ["u1", "u2"],
    ended: true,
    winners: ["u1"],
  } satisfies GiveawayConfig);

  // Mock kv.update to throw CAS error
  const origUpdate = kv.update;
  kv.update = () => {
    throw new Error("[KV] update() failed: CAS conflict");
  };

  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    const result = await giveawayCommand.execute({
      guildId,
      userId: "admin1",
      options: { subcommand: "reroll" },
      config: {},
    });
    assertEquals(result.success, false);
    assert(result.error?.includes("conflict"), "Should mention conflict in error");
    assert(result.error?.includes("try again"), "Should suggest retry");
  } finally {
    kv.update = origUpdate;
    restoreFetch();
  }
});

Deno.test("giveaway reroll: success with valid ended giveaway", async () => {
  resetStore();
  const guildId = "g2";

  await kv.set(giveawayKey(guildId), {
    prize: "Prize",
    channelId: "c2",
    messageId: "m2",
    endsAt: Date.now() - 1000,
    winnersCount: 1,
    entrants: ["u1", "u2", "u3"],
    ended: true,
    winners: ["u1"],
  } satisfies GiveawayConfig);

  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    const result = await giveawayCommand.execute({
      guildId,
      userId: "admin1",
      options: { subcommand: "reroll" },
      config: {},
    });
    assertEquals(result.success, true);
    assert(result.message?.includes("Rerolled"), "Should confirm reroll");
  } finally {
    restoreFetch();
  }
});
