import "../../../test/_mocks/env.ts";
import "../../../test/_mocks/sqlite.ts";
import { assertEquals, assert } from "@std/assert";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { kv } from "../../persistence/kv.ts";
import ticketClose from "./ticket-close.ts";
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

function makeCtx(guildId = "g1", channelId = "ch1") {
  return {
    customId: `ticket-close:${guildId}:${channelId}`,
    guildId,
    userId: "staff1",
    interaction: {},
  };
}

Deno.test("ticket-close: component metadata is correct", () => {
  assertEquals(ticketClose.customId, "ticket-close:");
  assertEquals(ticketClose.match, "prefix");
  assertEquals(ticketClose.type, "button");
});

Deno.test("ticket-close: returns error when ticket not found", async () => {
  resetStore();
  const result = await ticketClose.execute(makeCtx());
  assertEquals(result.success, false);
  assert(result.error!.includes("not found"));
});

Deno.test("ticket-close: returns error when ticket already closed", async () => {
  resetStore();
  await kv.set(ticketKey("g1", "ch1"), makeTicket({ status: "closed" }));
  const result = await ticketClose.execute(makeCtx());
  assertEquals(result.success, false);
  assert(result.error!.includes("closed"));
});

Deno.test("ticket-close: returns modal for open ticket", async () => {
  resetStore();
  await kv.set(ticketKey("g1", "ch1"), makeTicket());
  const result = await ticketClose.execute(makeCtx());
  assertEquals(result.success, true);
  assert(result.modal !== undefined);
  assertEquals(result.modal!.custom_id, "ticket-close-modal:g1:ch1");
  // Modal should have one text input for reason
  assertEquals(result.modal!.components.length, 1);
  assertEquals(result.modal!.components[0].components[0].custom_id, "close_reason");
});

Deno.test("ticket-close: returns error for invalid custom_id", async () => {
  resetStore();
  const result = await ticketClose.execute({
    customId: "ticket-close:",
    guildId: "g1",
    userId: "staff1",
    interaction: {},
  });
  assertEquals(result.success, false);
  assert(result.error!.includes("Invalid"));
});
