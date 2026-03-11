import "../test/_mocks/env.ts";
import "../test/_mocks/sqlite.ts";
import { assertEquals, assert } from "../test/assert.ts";
import { sqlite } from "../test/_mocks/sqlite.ts";
import { kv } from "../discord/persistence/kv.ts";
import { mockFetch, getCalls, restoreFetch, setNextThrow } from "../test/_mocks/fetch.ts";
import type { TicketData } from "../discord/interactions/commands/ticket.ts";
import runCron from "./tickets.cron.ts";

function resetStore() {
  (sqlite as any)._reset();
}

function makeTicket(overrides?: Partial<TicketData>): TicketData {
  return {
    guildId: "g1",
    channelId: "ch1",
    userId: "u1",
    title: "Test Ticket",
    staffMessageId: "smsg1",
    staffChannelId: "staff_ch",
    joinedStaff: [],
    status: "closed",
    closedBy: "staff1",
    createdAt: Date.now() - 86400000,
    ...overrides,
  };
}

Deno.test("tickets cron: deletes closed ticket channel and removes KV entry", async () => {
  resetStore();
  const key = "ticket:g1:ch1";
  await kv.set(key, makeTicket(), Date.now() - 1000);
  mockFetch({ default: { status: 200, body: {} } });
  try {
    await runCron();
    const remaining = await kv.get(key);
    assertEquals(remaining, null);

    // Verify DELETE call to Discord API
    const calls = getCalls();
    const deleteCall = calls.find((c) =>
      c.url.includes("channels/ch1") && c.init?.method === "DELETE"
    );
    assert(deleteCall !== undefined);
  } finally {
    restoreFetch();
  }
});

Deno.test("tickets cron: treats 404 as success", async () => {
  resetStore();
  const key = "ticket:g1:ch_gone";
  await kv.set(key, makeTicket({ channelId: "ch_gone" }), Date.now() - 1000);
  mockFetch({ default: { status: 404, body: { message: "Unknown Channel" } } });
  try {
    await runCron();
    const remaining = await kv.get(key);
    assertEquals(remaining, null);
  } finally {
    restoreFetch();
  }
});

Deno.test("tickets cron: skips open tickets", async () => {
  resetStore();
  const key = "ticket:g1:ch_open";
  await kv.set(key, makeTicket({ channelId: "ch_open", status: "open" }), Date.now() - 1000);
  mockFetch({ default: { status: 200, body: {} } });
  try {
    await runCron();
    // Open ticket should still exist (not claimed)
    const remaining = await kv.get(key);
    assert(remaining !== null);
  } finally {
    restoreFetch();
  }
});

Deno.test("tickets cron: re-inserts on failure with retry delay", async () => {
  resetStore();
  const key = "ticket:g1:ch_fail";
  const ticket = makeTicket({ channelId: "ch_fail" });
  await kv.set(key, ticket, Date.now() - 1000);
  mockFetch({ default: { status: 500, body: { message: "Internal Server Error" } } });
  try {
    await runCron();
    // Should be re-inserted for retry
    const remaining = await kv.get<TicketData>(key);
    assert(remaining !== null);
    assertEquals(remaining?.channelId, "ch_fail");
  } finally {
    restoreFetch();
  }
});

Deno.test("tickets cron: no-op when no due entries", async () => {
  resetStore();
  mockFetch({ default: { status: 200, body: {} } });
  try {
    await runCron();
    const calls = getCalls();
    // No Discord API calls should be made
    assertEquals(calls.length, 0);
  } finally {
    restoreFetch();
  }
});

Deno.test("tickets cron: timeout error re-inserts with retry delay", { sanitizeOps: false, sanitizeResources: false }, async () => {
  resetStore();
  const key = "ticket:g1:ch_timeout";
  const ticket = makeTicket({ channelId: "ch_timeout" });
  await kv.set(key, ticket, Date.now() - 1000);
  // Mock fetch to always throw so discordBotFetch fails on all retries
  mockFetch();
  const origFetch = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error("Timed out"); }) as any;
  try {
    await runCron();
    // Should be re-inserted for retry
    const remaining = await kv.get<TicketData>(key);
    assert(remaining !== null, "Ticket should be re-inserted after timeout");
    assertEquals(remaining?.channelId, "ch_timeout");
  } finally {
    globalThis.fetch = origFetch;
    restoreFetch();
  }
});

Deno.test("tickets cron: 403 error re-inserts (non-404 non-200)", async () => {
  resetStore();
  const key = "ticket:g1:ch_403";
  const ticket = makeTicket({ channelId: "ch_403" });
  await kv.set(key, ticket, Date.now() - 1000);
  mockFetch({ default: { status: 403, body: { message: "Missing Permissions" } } });
  try {
    await runCron();
    // 403 is not ok and not 404, so should be re-inserted
    const remaining = await kv.get<TicketData>(key);
    assert(remaining !== null, "Ticket should be re-inserted after 403 error");
    assertEquals(remaining?.channelId, "ch_403");
  } finally {
    restoreFetch();
  }
});

Deno.test("tickets cron: claimDelete returns false silently skips", async () => {
  resetStore();
  const key = "ticket:g1:ch_claimed";
  const ticket = makeTicket({ channelId: "ch_claimed" });
  await kv.set(key, ticket, Date.now() - 1000);

  const origClaimDelete = kv.claimDelete.bind(kv);
  (kv as any).claimDelete = async (k: string) => {
    if (k === key) return false;
    return origClaimDelete(k);
  };

  mockFetch({ default: { status: 200, body: {} } });
  try {
    await runCron();
    // claimDelete returned false — no Discord API call should be made
    const calls = getCalls();
    const deleteCall = calls.find((c) =>
      c.url.includes("channels/ch_claimed") && c.init?.method === "DELETE"
    );
    assertEquals(deleteCall, undefined, "Should not call Discord API when claimDelete returns false");
  } finally {
    (kv as any).claimDelete = origClaimDelete;
    restoreFetch();
  }
});

Deno.test("tickets cron: KV.set failure on re-insert does not crash", { sanitizeOps: false, sanitizeResources: false }, async () => {
  resetStore();
  const key = "ticket:g1:ch_reinsert_fail";
  const ticket = makeTicket({ channelId: "ch_reinsert_fail" });
  await kv.set(key, ticket, Date.now() - 1000);
  // Return 500 to trigger the catch block (re-insert path)
  mockFetch({ default: { status: 500, body: { message: "Internal Server Error" } } });

  // Monkey-patch kv.set to throw on re-insert
  const origSet = kv.set.bind(kv);
  let setCallCount = 0;
  (kv as any).set = async (...args: unknown[]) => {
    setCallCount++;
    // The re-insert kv.set is called after the catch block
    if (setCallCount > 0 && args[0] === key) {
      throw new Error("KV set failure");
    }
    return origSet(...(args as Parameters<typeof kv.set>));
  };

  try {
    // Should not throw even though kv.set fails on re-insert
    await runCron();
  } finally {
    (kv as any).set = origSet;
    restoreFetch();
  }
});
