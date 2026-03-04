import "../../../test/_mocks/env.ts";
import "../../../test/_mocks/sqlite.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { kv } from "../../persistence/kv.ts";
import { guildConfig } from "../../persistence/guild-config.ts";
import { mockFetch, getCalls, restoreFetch } from "../../../test/_mocks/fetch.ts";
import ticketModal from "./ticket-modal.ts";
import { type TicketData, ticketKey, ticketPrefix } from "../commands/ticket.ts";
import { finalizeAllLoggers } from "../../webhook/logger.ts";

function resetStore() {
  (sqlite as any)._reset();
}

function makeCtx(overrides?: Record<string, any>) {
  return {
    customId: "ticket-modal:g1",
    guildId: "g1",
    userId: "u1",
    interaction: {},
    fields: { ticket_title: "Test Title", ticket_description: "Test Description" },
    ...overrides,
  };
}

Deno.test("ticket-modal: component metadata is correct", () => {
  assertEquals(ticketModal.customId, "ticket-modal:");
  assertEquals(ticketModal.match, "prefix");
  assertEquals(ticketModal.type, "modal");
});

Deno.test("ticket-modal: returns error when not configured", async () => {
  resetStore();
  const result = await ticketModal.execute(makeCtx());
  assertEquals(result.success, false);
  assert(result.error!.includes("not configured"));
});

Deno.test("ticket-modal: returns error when at ticket limit", async () => {
  resetStore();
  await guildConfig.setTicketConfig("g1", "staff_ch", "cat1");
  for (let i = 1; i <= 3; i++) {
    await kv.set(ticketKey("g1", `existing_ch${i}`), {
      guildId: "g1",
      channelId: `existing_ch${i}`,
      userId: "u1",
      title: `T${i}`,
      staffMessageId: "sm",
      staffChannelId: "staff_ch",
      joinedStaff: [],
      status: "open",
      createdAt: Date.now(),
    } as TicketData);
  }

  const result = await ticketModal.execute(makeCtx());
  assertEquals(result.success, false);
  assert(result.error!.includes("3"));
});

Deno.test("ticket-modal: creates channel and stores ticket on success", async () => {
  resetStore();
  await guildConfig.setTicketConfig("g1", "staff_ch", "cat1");
  mockFetch({
    responses: [
      // Channel creation
      { status: 200, body: { id: "new_ch_123" } },
      // Post user message in ticket channel
      { status: 200, body: { id: "msg1" } },
      // Post staff embed
      { status: 200, body: { id: "staff_msg_1" } },
    ],
  });
  try {
    const result = await ticketModal.execute(makeCtx());
    assertEquals(result.success, true);
    assert(result.message!.includes("new_ch_123"));

    // Verify ticket stored in KV
    const ticket = await kv.get<TicketData>(ticketKey("g1", "new_ch_123"));
    assert(ticket !== null);
    assertEquals(ticket!.userId, "u1");
    assertEquals(ticket!.title, "Test Title");
    assertEquals(ticket!.status, "open");
    assertEquals(ticket!.staffMessageId, "staff_msg_1");

    // Verify channel creation API call
    const calls = getCalls();
    const createCall = calls.find((c) => c.url.includes("guilds/g1/channels"));
    assert(createCall !== undefined);
    const body = JSON.parse(createCall!.init?.body as string);
    assertEquals(body.parent_id, "cat1");
    assert(body.permission_overwrites.length === 3);
  } finally {
    restoreFetch();
  }
});

Deno.test("ticket-modal: returns error when channel creation fails", async () => {
  resetStore();
  await guildConfig.setTicketConfig("g1", "staff_ch", "cat1");
  mockFetch({
    responses: [
      { status: 403, body: { message: "Missing permissions" } },
    ],
  });
  try {
    const result = await ticketModal.execute(makeCtx());
    assertEquals(result.success, false);
    assert(result.error!.includes("Failed to create"));
  } finally {
    restoreFetch();
    await finalizeAllLoggers();
  }
});

Deno.test("ticket-modal: increments ticket counter atomically", async () => {
  resetStore();
  await guildConfig.setTicketConfig("g1", "staff_ch", "cat1");
  mockFetch({ default: { status: 200, body: { id: "ch_new" } } });
  try {
    await ticketModal.execute(makeCtx());
    const counter = await kv.get<number>("ticket-counter:g1");
    assertEquals(counter, 1);

    // Reset store but keep counter, create new ticket
    await guildConfig.setTicketConfig("g1", "staff_ch", "cat1");
    await ticketModal.execute(makeCtx({ userId: "u2" }));
    const counter2 = await kv.get<number>("ticket-counter:g1");
    assertEquals(counter2, 2);
  } finally {
    restoreFetch();
  }
});
