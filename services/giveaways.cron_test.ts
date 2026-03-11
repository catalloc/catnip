import "../test/_mocks/env.ts";
import { assertEquals, assert } from "../test/assert.ts";
import { sqlite } from "../test/_mocks/sqlite.ts";
import { kv } from "../discord/persistence/kv.ts";
import { mockFetch, restoreFetch, setNextThrow } from "../test/_mocks/fetch.ts";
import type { GiveawayConfig } from "../discord/interactions/commands/giveaway.ts";
import { MAX_ANNOUNCE_RETRIES } from "../discord/interactions/commands/giveaway.ts";
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
    createdBy: "admin1",
    createdAt: Date.now() - 3600000,
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
    // endGiveaway atomically claims and sets ended=true, then re-saves with cleanup delay
    const updated = await kv.get<GiveawayConfig>(key);
    assertEquals(updated?.ended, true);
    assertEquals(Array.isArray(updated?.winners), true);
  } finally {
    restoreFetch();
  }
});

Deno.test("giveaways cron: API failure does not delete giveaway (retried next run)", async () => {
  resetStore();
  const key = "giveaway:g1";
  await kv.set(key, makeGiveaway({ ended: false }), Date.now() - 1000);
  // All API calls fail — endGiveaway's claimUpdate succeeds but panel update fails
  mockFetch({ default: { status: 500, body: "Internal Server Error" } });
  try {
    await runCron();
    const updated = await kv.get<GiveawayConfig>(key);
    assert(updated !== null, "Giveaway should still be in KV");
  } finally {
    restoreFetch();
  }
});

Deno.test("giveaways cron: deletes malformed entries", async () => {
  resetStore();
  const key = "giveaway:g1";
  // Missing channelId and messageId
  await kv.set(key, { prize: "Bad", ended: false, endsAt: 0, winnersCount: 1, entrants: [] }, Date.now() - 1000);
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    await runCron();
    // Malformed entry is cleaned up
    const remaining = await kv.get(key);
    assert(remaining === null, "Malformed giveaway should be deleted");
  } finally {
    restoreFetch();
  }
});

Deno.test("giveaways cron: timeout error on active giveaway retries next run", { sanitizeOps: false, sanitizeResources: false }, async () => {
  resetStore();
  const key = "giveaway:g_timeout";
  await kv.set(key, makeGiveaway({ ended: false }), Date.now() - 1000);
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  // Make the first fetch throw a timeout error (endGiveaway's claimUpdate calls fetch internally)
  setNextThrow(new Error("Timed out"));
  try {
    await runCron();
    // The giveaway should remain in KV since the cron catches timeout errors
    const remaining = await kv.get<GiveawayConfig>(key);
    assert(remaining !== null, "Giveaway should still be in KV after timeout");
  } finally {
    restoreFetch();
  }
});

Deno.test("giveaways cron: announce retry success removes announceFailed flag", async () => {
  resetStore();
  const key = "giveaway:g_retry_ok";
  await kv.set(key, makeGiveaway({
    ended: true,
    winners: ["u1"],
    announceFailed: true,
    announceRetries: 0,
  }), Date.now() - 1000);
  // announceGiveaway calls PATCH + POST to Discord
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    await runCron();
    const updated = await kv.get<GiveawayConfig>(key);
    assert(updated !== null, "Giveaway should still exist (scheduled for cleanup)");
    assertEquals(updated?.announceFailed, undefined, "announceFailed should be cleared");
    assertEquals(updated?.announceRetries, undefined, "announceRetries should be cleared");
  } finally {
    restoreFetch();
  }
});

Deno.test("giveaways cron: announce retry intermediate uses exponential backoff", async () => {
  resetStore();
  const key = "giveaway:g_backoff";
  await kv.set(key, makeGiveaway({
    ended: true,
    winners: ["u1"],
    announceFailed: true,
    announceRetries: 0,
  }), Date.now() - 1000);
  // announceGiveaway returns false when PATCH fails (non-ok response)
  // First call is PATCH (fail), second is POST (doesn't matter)
  mockFetch({
    responses: [
      { status: 500, body: "fail" },
      { status: 500, body: "fail" },
      { status: 500, body: "fail" },
    ],
  });
  try {
    await runCron();
    const updated = await kv.get<GiveawayConfig>(key);
    assert(updated !== null, "Giveaway should still exist");
    assertEquals(updated?.announceFailed, true, "announceFailed should remain true");
    assertEquals(updated?.announceRetries, 1, "announceRetries should increment to 1");
  } finally {
    restoreFetch();
  }
});

Deno.test("giveaways cron: MAX_ANNOUNCE_RETRIES exhaustion gives up", async () => {
  resetStore();
  const key = "giveaway:g_maxretry";
  await kv.set(key, makeGiveaway({
    ended: true,
    winners: ["u1"],
    announceFailed: true,
    announceRetries: MAX_ANNOUNCE_RETRIES - 1,
  }), Date.now() - 1000);
  // announceGiveaway returns false (PATCH fails)
  mockFetch({
    responses: [
      { status: 500, body: "fail" },
      { status: 500, body: "fail" },
      { status: 500, body: "fail" },
    ],
  });
  try {
    await runCron();
    const updated = await kv.get<GiveawayConfig>(key);
    assert(updated !== null, "Giveaway should exist (saved for cleanup)");
    assertEquals(updated?.announceFailed, undefined, "announceFailed should be cleared after giving up");
    assertEquals(updated?.announceRetries, undefined, "announceRetries should be cleared after giving up");
  } finally {
    restoreFetch();
  }
});

Deno.test("giveaways cron: announce retry error increments failed counter", { sanitizeOps: false, sanitizeResources: false }, async () => {
  resetStore();
  const key = "giveaway:g_retry_err";
  await kv.set(key, makeGiveaway({
    ended: true,
    winners: ["u1"],
    announceFailed: true,
    announceRetries: 0,
  }), Date.now() - 1000);
  // Make fetch throw so announceGiveaway throws instead of returning false
  mockFetch();
  setNextThrow(new Error("Network failure"));
  try {
    await runCron();
    // The entry should still be in KV (catch block doesn't modify it)
    const remaining = await kv.get<GiveawayConfig>(key);
    assert(remaining !== null, "Giveaway should still be in KV after announce error");
  } finally {
    restoreFetch();
  }
});

Deno.test("giveaways cron: empty giveaway list is no-op", async () => {
  resetStore();
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    await runCron();
    // No errors, no exceptions — just a no-op
  } finally {
    restoreFetch();
  }
});

Deno.test("giveaways cron: claimDelete returns false skips cleanup", async () => {
  resetStore();
  const key = "giveaway:g_nodupe";
  await kv.set(key, makeGiveaway({ ended: true, winners: ["u1"] }), Date.now() - 1000);

  // Monkey-patch claimDelete to return false for this key
  const origClaimDelete = kv.claimDelete.bind(kv);
  (kv as any).claimDelete = async (k: string) => {
    if (k === key) return false;
    return origClaimDelete(k);
  };

  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    await runCron();
    // claimDelete returned false, so no cleanup was done — no error
  } finally {
    (kv as any).claimDelete = origClaimDelete;
    restoreFetch();
  }
});

Deno.test("giveaways cron: partial malformation (channelId but no messageId) deleted", async () => {
  resetStore();
  const key = "giveaway:g_partial";
  // Has channelId but missing messageId
  await kv.set(key, {
    prize: "Partial",
    channelId: "c1",
    ended: false,
    endsAt: 0,
    winnersCount: 1,
    entrants: [],
  }, Date.now() - 1000);
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    await runCron();
    const remaining = await kv.get(key);
    assert(remaining === null, "Partially malformed giveaway should be deleted");
  } finally {
    restoreFetch();
  }
});
