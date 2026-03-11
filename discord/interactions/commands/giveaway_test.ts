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
    createdBy: "admin1",
    createdAt: Date.now() - 3600000,
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
    createdBy: "admin1",
    createdAt: Date.now() - 3600000,
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
    createdBy: "admin1",
    createdAt: Date.now() - 3600000,
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

// --- info subcommand ---

Deno.test("giveaway info: no giveaway returns error", async () => {
  resetStore();
  const result = await giveawayCommand.execute({
    guildId: "g_none",
    userId: "admin1",
    options: { subcommand: "info" },
    config: {},
  });
  assertEquals(result.success, false);
  assert(result.error?.includes("No giveaway"));
});

Deno.test("giveaway info: active giveaway shows details", async () => {
  resetStore();
  const guildId = "g_info_active";
  await kv.set(giveawayKey(guildId), {
    prize: "Cool Prize",
    channelId: "c1",
    messageId: "m1",
    endsAt: Date.now() + 3600000,
    winnersCount: 2,
    entrants: ["u1", "u2"],
    ended: false,
    createdBy: "host1",
    createdAt: Date.now() - 60000,
    description: "Win something cool!",
  } satisfies GiveawayConfig);

  const result = await giveawayCommand.execute({
    guildId,
    userId: "admin1",
    options: { subcommand: "info" },
    config: {},
  });
  assertEquals(result.success, true);
  assert(result.embeds);
  const embed = result.embeds[0];
  assert(embed.title?.includes("Info"));
  assert(embed.description?.includes("Cool Prize"));
  assert(embed.description?.includes("<@host1>"));
  assert(embed.description?.includes("Active"));
  assert(embed.description?.includes("Win something cool!"));
  assert(embed.description?.includes("2")); // entries count
});

Deno.test("giveaway info: ended giveaway shows winners", async () => {
  resetStore();
  const guildId = "g_info_ended";
  await kv.set(giveawayKey(guildId), {
    prize: "Ended Prize",
    channelId: "c1",
    messageId: "m1",
    endsAt: Date.now() - 1000,
    winnersCount: 1,
    entrants: ["u1", "u2"],
    ended: true,
    winners: ["u2"],
    createdBy: "host1",
    createdAt: Date.now() - 3600000,
  } satisfies GiveawayConfig);

  const result = await giveawayCommand.execute({
    guildId,
    userId: "admin1",
    options: { subcommand: "info" },
    config: {},
  });
  assertEquals(result.success, true);
  assert(result.embeds);
  const embed = result.embeds[0];
  assert(embed.title?.includes("Ended"));
  assert(embed.description?.includes("Ended Prize"));
  assert(embed.description?.includes("<@u2>")); // winner
  assert(embed.description?.includes("Ended"), "Should show ended status");
});

// --- create with description ---

Deno.test("giveaway create: stores description when provided", async () => {
  resetStore();
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    const result = await giveawayCommand.execute({
      guildId: "g_desc",
      userId: "admin1",
      options: { subcommand: "create", prize: "Prize", duration: "1h", channel: "c1", description: "A cool giveaway!" },
      config: {},
    });
    assertEquals(result.success, true);
    const config = await kv.get<GiveawayConfig>(giveawayKey("g_desc"));
    assertEquals(config?.description, "A cool giveaway!");
    assertEquals(config?.createdBy, "admin1");
    assert(config?.createdAt! > 0);
  } finally {
    restoreFetch();
  }
});

Deno.test("giveaway create: no description when not provided", async () => {
  resetStore();
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    const result = await giveawayCommand.execute({
      guildId: "g_nodesc",
      userId: "admin1",
      options: { subcommand: "create", prize: "Prize", duration: "1h", channel: "c1" },
      config: {},
    });
    assertEquals(result.success, true);
    const config = await kv.get<GiveawayConfig>(giveawayKey("g_nodesc"));
    assertEquals(config?.description, undefined);
  } finally {
    restoreFetch();
  }
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
    createdBy: "admin1",
    createdAt: Date.now() - 3600000,
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

// ── Batch 4b tests ──

Deno.test("giveaway: create with duration exactly 60s succeeds", async () => {
  resetStore();
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    const result = await giveawayCommand.execute({
      guildId: "g_60s",
      userId: "admin1",
      options: { subcommand: "create", prize: "Prize", duration: "1m", channel: "c1", winners: 1 },
      config: {},
    });
    assertEquals(result.success, true);
    assert(result.message?.includes("Prize"));
  } finally {
    restoreFetch();
  }
});

Deno.test("giveaway: winners clamped to 1 when 0 requested", async () => {
  resetStore();
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    const result = await giveawayCommand.execute({
      guildId: "g_clamp0",
      userId: "admin1",
      options: { subcommand: "create", prize: "Prize", duration: "1h", channel: "c1", winners: 0 },
      config: {},
    });
    assertEquals(result.success, true);
    // Verify clamped to 1 winner
    const config = await kv.get<GiveawayConfig>(giveawayKey("g_clamp0"));
    assertEquals(config?.winnersCount, 1);
  } finally {
    restoreFetch();
  }
});

Deno.test("giveaway: winners clamped to 10 when 11 requested", async () => {
  resetStore();
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    const result = await giveawayCommand.execute({
      guildId: "g_clamp11",
      userId: "admin1",
      options: { subcommand: "create", prize: "Prize", duration: "1h", channel: "c1", winners: 11 },
      config: {},
    });
    assertEquals(result.success, true);
    // Verify clamped to 10 winners
    const config = await kv.get<GiveawayConfig>(giveawayKey("g_clamp11"));
    assertEquals(config?.winnersCount, 10);
  } finally {
    restoreFetch();
  }
});

Deno.test("giveaway: reroll with no entrants returns error", async () => {
  resetStore();
  const guildId = "g_no_entrants_reroll";
  await kv.set(giveawayKey(guildId), {
    prize: "Prize",
    channelId: "c1",
    messageId: "m1",
    endsAt: Date.now() - 1000,
    winnersCount: 1,
    entrants: [],
    ended: true,
    winners: [],
    createdBy: "admin1",
    createdAt: Date.now() - 3600000,
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
