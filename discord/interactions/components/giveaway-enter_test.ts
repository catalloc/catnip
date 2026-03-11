import "../../../test/_mocks/env.ts";
import "../../../test/_mocks/sqlite.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { kv } from "../../persistence/kv.ts";
import { mockFetch, getCalls, restoreFetch } from "../../../test/_mocks/fetch.ts";
import giveawayEnter from "./giveaway-enter.ts";
import { giveawayKey, type GiveawayConfig } from "../commands/giveaway.ts";

function resetStore() {
  (sqlite as any)._reset();
}

function makeConfig(overrides?: Partial<GiveawayConfig>): GiveawayConfig {
  return {
    prize: "Test Prize",
    winnersCount: 1,
    entrants: [],
    channelId: "ch1",
    messageId: "msg1",
    createdBy: "admin1",
    createdAt: Date.now() - 60_000,
    endsAt: Date.now() + 60_000,
    ended: false,
    ...overrides,
  };
}

function makeCtx(guildId = "g1", userId = "u1", customId = "giveaway-enter:g1") {
  return { customId, guildId, userId, interaction: {} };
}

Deno.test("giveaway-enter: returns error when giveaway not found", async () => {
  resetStore();
  const result = await giveawayEnter.execute(makeCtx());
  assertEquals(result.success, false);
  assertEquals(result.error, "This giveaway has ended.");
});

Deno.test("giveaway-enter: returns error when giveaway has ended", async () => {
  resetStore();
  await kv.set(giveawayKey("g1"), makeConfig({ ended: true }));
  const result = await giveawayEnter.execute(makeCtx());
  assertEquals(result.success, false);
  assertEquals(result.error, "This giveaway has ended.");
});

Deno.test("giveaway-enter: successfully enters user", async () => {
  resetStore();
  await kv.set(giveawayKey("g1"), makeConfig());
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const result = await giveawayEnter.execute(makeCtx());
    assertEquals(result.success, true);
    assert(result.message!.includes("Test Prize"));

    // Verify user was added to entrants
    const config = await kv.get<GiveawayConfig>(giveawayKey("g1"));
    assert(config!.entrants.includes("u1"));
  } finally {
    restoreFetch();
  }
});

Deno.test("giveaway-enter: duplicate entry returns already entered", async () => {
  resetStore();
  await kv.set(giveawayKey("g1"), makeConfig({ entrants: ["u1"] }));
  const result = await giveawayEnter.execute(makeCtx());
  assertEquals(result.success, true);
  assert(result.message!.includes("already entered"));
});

Deno.test("giveaway-enter: rejects when at max entrants", async () => {
  resetStore();
  // Create a giveaway with MAX_ENTRANTS entrants
  const entrants = Array.from({ length: 10_000 }, (_, i) => `user${i}`);
  await kv.set(giveawayKey("g1"), makeConfig({ entrants }));
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const result = await giveawayEnter.execute(makeCtx("g1", "new_user"));
    assertEquals(result.success, false);
    assert(result.error!.includes("maximum"));
  } finally {
    restoreFetch();
  }
});

Deno.test("giveaway-enter: component metadata is correct", () => {
  assertEquals(giveawayEnter.customId, "giveaway-enter:");
  assertEquals(giveawayEnter.match, "prefix");
  assertEquals(giveawayEnter.type, "button");
});
