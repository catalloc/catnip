import "../../../test/_mocks/env.ts";
import "../../../test/_mocks/sqlite.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { kv } from "../../persistence/kv.ts";
import { mockFetch, restoreFetch } from "../../../test/_mocks/fetch.ts";
import ticketCloseModal from "./ticket-close-modal.ts";
import { type TicketData, ticketKey } from "../commands/ticket.ts";

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
    status: "open",
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeCtx(guildId = "g1", channelId = "ch1", reason?: string) {
  return {
    customId: `ticket-close-modal:${guildId}:${channelId}`,
    guildId,
    userId: "staff1",
    interaction: {},
    fields: { close_reason: reason ?? "" },
  };
}

Deno.test("ticket-close-modal: component metadata is correct", () => {
  assertEquals(ticketCloseModal.customId, "ticket-close-modal:");
  assertEquals(ticketCloseModal.match, "prefix");
  assertEquals(ticketCloseModal.type, "modal");
});

Deno.test("ticket-close-modal: successfully closes ticket with reason", async () => {
  resetStore();
  await kv.set(ticketKey("g1", "ch1"), makeTicket());
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const result = await ticketCloseModal.execute(makeCtx("g1", "ch1", "Issue resolved"));
    assertEquals(result.success, true);
    assert(result.message!.includes("closed"));

    const ticket = await kv.get<TicketData>(ticketKey("g1", "ch1"));
    assertEquals(ticket?.status, "closed");
    assertEquals(ticket?.closedBy, "staff1");
    assertEquals(ticket?.closeReason, "Issue resolved");
  } finally {
    restoreFetch();
  }
});

Deno.test("ticket-close-modal: closes ticket without reason", async () => {
  resetStore();
  await kv.set(ticketKey("g1", "ch1"), makeTicket());
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const result = await ticketCloseModal.execute(makeCtx("g1", "ch1", ""));
    assertEquals(result.success, true);

    const ticket = await kv.get<TicketData>(ticketKey("g1", "ch1"));
    assertEquals(ticket?.status, "closed");
    assertEquals(ticket?.closeReason, undefined);
  } finally {
    restoreFetch();
  }
});

Deno.test("ticket-close-modal: returns error when already closed", async () => {
  resetStore();
  await kv.set(ticketKey("g1", "ch1"), makeTicket({ status: "closed" }));
  const result = await ticketCloseModal.execute(makeCtx());
  assertEquals(result.success, false);
  assert(result.error!.includes("already be closed"));
});

Deno.test("ticket-close-modal: returns error when ticket not found", async () => {
  resetStore();
  const result = await ticketCloseModal.execute(makeCtx("g1", "nonexistent"));
  assertEquals(result.success, false);
  assert(result.error!.includes("closed"));
});

Deno.test("ticket-close-modal: returns error for invalid custom_id", async () => {
  resetStore();
  const result = await ticketCloseModal.execute({
    customId: "ticket-close-modal:",
    guildId: "g1",
    userId: "staff1",
    interaction: {},
    fields: {},
  });
  assertEquals(result.success, false);
  assert(result.error!.includes("Invalid"));
});
