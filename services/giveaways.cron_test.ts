import "../test/_mocks/env.ts";
import { assertEquals } from "@std/assert";
import { sqlite } from "../test/_mocks/sqlite.ts";
import { kv } from "../discord/persistence/kv.ts";
import { mockFetch, restoreFetch } from "../test/_mocks/fetch.ts";
import type { GiveawayConfig } from "../discord/interactions/commands/giveaway.ts";
import runCron from "./giveaways.cron.ts";

function resetStore() {
  (sqlite as any)._reset();
}

function makeGiveaway(overrides?: Partial<GiveawayConfig>): GiveawayConfig {
  return {
    prize: "Test Prize",
    channelId: "c1",
    messageId: "m1",
    endsAt: Date.now() - 1000,
    winnersCount: 1,
    entrants: ["u1", "u2"],
    ended: false,
    ...overrides,
  };
}

Deno.test("giveaways cron: ended giveaway is cleaned up", async () => {
  resetStore();
  const key = "giveaway:g1";
  await kv.set(key, makeGiveaway({ ended: true, winners: ["u1"] }), Date.now() - 1000);
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    await runCron();
    const remaining = await kv.get(key);
    assertEquals(remaining, null);
  } finally {
    restoreFetch();
  }
});

Deno.test("giveaways cron: active giveaway gets ended", async () => {
  resetStore();
  const key = "giveaway:g1";
  await kv.set(key, makeGiveaway({ ended: false }), Date.now() - 1000);
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    await runCron();
    // endGiveaway re-reads from KV and sets ended=true, then re-saves with cleanup delay
    const updated = await kv.get<GiveawayConfig>(key);
    assertEquals(updated?.ended, true);
    assertEquals(Array.isArray(updated?.winners), true);
  } finally {
    restoreFetch();
  }
});
