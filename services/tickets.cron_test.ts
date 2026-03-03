import "../test/_mocks/env.ts";
import "../test/_mocks/sqlite.ts";
import { assertEquals, assert } from "@std/assert";
import { sqlite } from "../test/_mocks/sqlite.ts";
import { kv } from "../discord/persistence/kv.ts";
import { mockFetch, getCalls, restoreFetch } from "../test/_mocks/fetch.ts";
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
