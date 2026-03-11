import "../../../test/_mocks/env.ts";
import "../../../test/_mocks/sqlite.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { kv } from "../../persistence/kv.ts";
import { mockFetch, getCalls, restoreFetch } from "../../../test/_mocks/fetch.ts";
import ticketJoin from "./ticket-join.ts";
import { type TicketData, ticketKey } from "../commands/ticket.ts";

function resetStore() {
  (sqlite as any)._reset();
}

function makeTicket(overrides?: Partial<TicketData>): TicketData {
  return {
    guildId: "g1",
    channelId: "ch1",
    userId: "creator1",
    title: "Test Ticket",
    staffMessageId: "smsg1",
    staffChannelId: "staff_ch",
    joinedStaff: [],
    status: "open",
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeCtx(guildId = "g1", channelId = "ch1", userId = "staff1") {
  return {
    customId: `ticket-join:${guildId}:${channelId}`,
    guildId,
    userId,
    interaction: {},
  };
}

Deno.test("ticket-join: component metadata is correct", () => {
  assertEquals(ticketJoin.customId, "ticket-join:");
  assertEquals(ticketJoin.match, "prefix");
  assertEquals(ticketJoin.type, "button");
});

Deno.test("ticket-join: returns error when ticket not found", async () => {
  resetStore();
  const result = await ticketJoin.execute(makeCtx());
  assertEquals(result.success, false);
  assert(result.error!.includes("not found"));
});

Deno.test("ticket-join: returns error when ticket closed", async () => {
  resetStore();
  await kv.set(ticketKey("g1", "ch1"), makeTicket({ status: "closed" }));
  const result = await ticketJoin.execute(makeCtx());
  assertEquals(result.success, false);
  assert(result.error!.includes("closed"));
});

Deno.test("ticket-join: returns error when already joined", async () => {
  resetStore();
  await kv.set(ticketKey("g1", "ch1"), makeTicket({ joinedStaff: ["staff1"] }));
  const result = await ticketJoin.execute(makeCtx());
  assertEquals(result.success, false);
  assert(result.error!.includes("already joined"));
});

Deno.test("ticket-join: successfully joins ticket", async () => {
  resetStore();
  await kv.set(ticketKey("g1", "ch1"), makeTicket());
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const result = await ticketJoin.execute(makeCtx());
    assertEquals(result.success, true);
    assertEquals(result.updateMessage, true);
    assert(result.embed !== undefined);

    // Verify staff added to KV
    const ticket = await kv.get<TicketData>(ticketKey("g1", "ch1"));
    assert(ticket!.joinedStaff.includes("staff1"));

    // Verify permission API call
    const calls = getCalls();
    const permCall = calls.find((c) => c.url.includes("channels/ch1/permissions/staff1"));
    assert(permCall !== undefined);
    assertEquals(permCall!.init?.method, "PUT");

    // Verify join notice posted
    const msgCall = calls.find((c) => c.url.includes("channels/ch1/messages"));
    assert(msgCall !== undefined);
  } finally {
    restoreFetch();
  }
});

Deno.test("ticket-join: returns error when permission call fails", async () => {
  resetStore();
  await kv.set(ticketKey("g1", "ch1"), makeTicket());
  mockFetch({ default: { status: 403, body: { message: "Missing perms" } } });
  try {
    const result = await ticketJoin.execute(makeCtx());
    assertEquals(result.success, false);
    assert(result.error!.includes("Failed"));
  } finally {
    restoreFetch();
  }
});

Deno.test("ticket-join: returns error for invalid custom_id", async () => {
  resetStore();
  const result = await ticketJoin.execute({
    customId: "ticket-join:",
    guildId: "g1",
    userId: "staff1",
    interaction: {},
  });
  assertEquals(result.success, false);
  assert(result.error!.includes("Invalid"));
});
