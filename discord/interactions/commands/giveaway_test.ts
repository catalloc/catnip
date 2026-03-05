import "../../../test/_mocks/env.ts";
import { assertEquals, assert, assertNotStrictEquals } from "../../../test/assert.ts";
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

// --- create: duration < 60s returns error ---

Deno.test("giveaway create: duration < 60s returns error", async () => {
  resetStore();
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    const result = await giveawayCommand.execute({
      guildId: "g1",
      userId: "admin1",
      options: { subcommand: "create", prize: "Prize", duration: "30s", channel: "c1", winners: 1 },
      config: {},
    });
    assertEquals(result.success, false);
    assert(result.error?.includes("at least 1 minute"));
  } finally {
    restoreFetch();
  }
});

// --- create: POST message failure returns error ---

Deno.test("giveaway create: POST message failure returns error", async () => {
  resetStore();
  mockFetch({ default: { status: 403, body: "Forbidden" } });
  try {
    const result = await giveawayCommand.execute({
      guildId: "g1",
      userId: "admin1",
      options: { subcommand: "create", prize: "Prize", duration: "1h", channel: "c1" },
      config: {},
    });
    assertEquals(result.success, false);
    assert(result.error?.includes("Failed to post"));
  } finally {
    restoreFetch();
  }
});

// --- end: no active giveaway returns error ---

Deno.test("giveaway end: no active giveaway returns error", async () => {
  resetStore();
  const result = await giveawayCommand.execute({
    guildId: "g_no_giveaway",
    userId: "admin1",
    options: { subcommand: "end" },
    config: {},
  });
  assertEquals(result.success, false);
  assert(result.error?.includes("No active giveaway"));
});

// --- reroll: zero entrants returns error ---

Deno.test("giveaway reroll: zero entrants returns error", async () => {
  resetStore();
  const guildId = "g_empty";
  await kv.set(giveawayKey(guildId), {
    prize: "Prize",
    channelId: "c1",
    messageId: "m1",
    endsAt: Date.now() - 1000,
    winnersCount: 1,
    entrants: [],
    ended: true,
    winners: [],
  } satisfies GiveawayConfig);
  const result = await giveawayCommand.execute({
    guildId,
    userId: "admin1",
    options: { subcommand: "reroll" },
    config: {},
  });
  assertEquals(result.success, false);
  assert(result.error?.includes("No entrants"));
});

// --- reroll: giveaway not ended returns error ---

Deno.test("giveaway reroll: giveaway not ended returns error", async () => {
  resetStore();
  const guildId = "g_active";
  await kv.set(giveawayKey(guildId), {
    prize: "Prize",
    channelId: "c1",
    messageId: "m1",
    endsAt: Date.now() + 3600000,
    winnersCount: 1,
    entrants: ["u1"],
    ended: false,
  } satisfies GiveawayConfig);
  const result = await giveawayCommand.execute({
    guildId,
    userId: "admin1",
    options: { subcommand: "reroll" },
    config: {},
  });
  assertEquals(result.success, false);
  assert(result.error?.includes("still active"));
});

// --- unknown subcommand ---

Deno.test("giveaway: unknown subcommand returns error", async () => {
  resetStore();
  const result = await giveawayCommand.execute({
    guildId: "g1",
    userId: "admin1",
    options: { subcommand: "invalid" },
    config: {},
  });
  assertEquals(result.success, false);
  assert(result.error?.includes("subcommand"));
});
