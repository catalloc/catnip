import "../../../test/_mocks/env.ts";
import "../../../test/_mocks/sqlite.ts";
import { assertEquals, assert } from "@std/assert";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { kv } from "../../persistence/kv.ts";
import { guildConfig } from "../../persistence/guild-config.ts";
import { mockFetch, getCalls, restoreFetch } from "../../../test/_mocks/fetch.ts";
import ticketCommand, {
  type TicketData,
  ticketKey,
  ticketPrefix,
  countOpenTickets,
  buildStaffEmbed,
  buildStaffComponents,
  closeTicket,
  KV_PREFIX,
  DELETE_DELAY_MS,
} from "./ticket.ts";

function resetStore() {
  (sqlite as any)._reset();
}

function makeTicket(overrides?: Partial<TicketData>): TicketData {
  return {
    guildId: "g1",
    channelId: "ch1",
    userId: "u1",
    title: "Test Issue",
    staffMessageId: "smsg1",
    staffChannelId: "staff_ch",
    joinedStaff: [],
    status: "open",
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeCtx(overrides?: Record<string, any>) {
  return {
    guildId: "g1",
    userId: "u1",
    options: {} as Record<string, any>,
    config: {},
    memberRoles: [] as string[],
    memberPermissions: undefined as string | undefined,
    ...overrides,
  };
}

// --- Key helpers ---

Deno.test("ticketKey: returns correct key", () => {
  assertEquals(ticketKey("g1", "ch1"), "ticket:g1:ch1");
});

Deno.test("ticketPrefix: returns correct prefix", () => {
  assertEquals(ticketPrefix("g1"), "ticket:g1:");
});

Deno.test("KV_PREFIX: is ticket:", () => {
  assertEquals(KV_PREFIX, "ticket:");
});

// --- countOpenTickets ---

Deno.test("countOpenTickets: returns 0 when no tickets", async () => {
  resetStore();
  const count = await countOpenTickets("g1", "u1");
  assertEquals(count, 0);
});

Deno.test("countOpenTickets: counts only open tickets for user", async () => {
  resetStore();
  await kv.set(ticketKey("g1", "ch1"), makeTicket({ userId: "u1", status: "open" }));
  await kv.set(ticketKey("g1", "ch2"), makeTicket({ channelId: "ch2", userId: "u1", status: "open" }));
  await kv.set(ticketKey("g1", "ch3"), makeTicket({ channelId: "ch3", userId: "u1", status: "closed" }));
  await kv.set(ticketKey("g1", "ch4"), makeTicket({ channelId: "ch4", userId: "u2", status: "open" }));

  const count = await countOpenTickets("g1", "u1");
  assertEquals(count, 2);
});

// --- buildStaffEmbed ---

Deno.test("buildStaffEmbed: open ticket has correct color and fields", () => {
  const ticket = makeTicket();
  const embed = buildStaffEmbed(ticket);
  assertEquals(embed.title, "Ticket — Test Issue");
  assertEquals(embed.color, 0x5865f2); // EmbedColors.INFO
  const statusField = embed.fields.find((f: any) => f.name === "Status");
  assertEquals(statusField?.value, "Open");
});

Deno.test("buildStaffEmbed: closed ticket shows close info", () => {
  const ticket = makeTicket({ status: "closed", closedBy: "staff1", closeReason: "Resolved" });
  const embed = buildStaffEmbed(ticket);
  assertEquals(embed.title, "Ticket Closed — Test Issue");
  assertEquals(embed.color, 0xed4245); // EmbedColors.ERROR
  const closedByField = embed.fields.find((f: any) => f.name === "Closed By");
  assertEquals(closedByField?.value, "<@staff1>");
  const reasonField = embed.fields.find((f: any) => f.name === "Reason");
  assertEquals(reasonField?.value, "Resolved");
});

Deno.test("buildStaffEmbed: shows joined staff", () => {
  const ticket = makeTicket({ joinedStaff: ["s1", "s2"] });
  const embed = buildStaffEmbed(ticket);
  const staffField = embed.fields.find((f: any) => f.name === "Staff");
  assert(staffField?.value.includes("<@s1>"));
  assert(staffField?.value.includes("<@s2>"));
});

// --- buildStaffComponents ---

Deno.test("buildStaffComponents: returns buttons when open", () => {
  const components = buildStaffComponents("g1", "ch1");
  assertEquals(components.length, 1);
  assertEquals(components[0].components.length, 2);
  assertEquals(components[0].components[0].custom_id, "ticket-join:g1:ch1");
  assertEquals(components[0].components[1].custom_id, "ticket-close:g1:ch1");
});

Deno.test("buildStaffComponents: returns empty when closed", () => {
  const components = buildStaffComponents("g1", "ch1", true);
  assertEquals(components.length, 0);
});

// --- closeTicket ---

Deno.test("closeTicket: closes an open ticket and sets due_at", async () => {
  resetStore();
  const ticket = makeTicket();
  await kv.set(ticketKey("g1", "ch1"), ticket);
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const before = Date.now();
    const result = await closeTicket("g1", "ch1", "staff1", "Done");
    assert(result !== null);
    assertEquals(result!.status, "closed");
    assertEquals(result!.closedBy, "staff1");
    assertEquals(result!.closeReason, "Done");

    // Verify KV was updated with due_at
    const stored = await kv.get<TicketData>(ticketKey("g1", "ch1"));
    assertEquals(stored?.status, "closed");
  } finally {
    restoreFetch();
  }
});

Deno.test("closeTicket: returns null for already closed ticket", async () => {
  resetStore();
  await kv.set(ticketKey("g1", "ch1"), makeTicket({ status: "closed" }));
  const result = await closeTicket("g1", "ch1", "staff1");
  assertEquals(result, null);
});

Deno.test("closeTicket: returns null when ticket not found", async () => {
  resetStore();
  const result = await closeTicket("g1", "nonexistent", "staff1");
  assertEquals(result, null);
});

Deno.test("closeTicket: makes expected API calls", async () => {
  resetStore();
  await kv.set(ticketKey("g1", "ch1"), makeTicket());
  mockFetch({ default: { status: 200, body: {} } });
  try {
    await closeTicket("g1", "ch1", "staff1", "Test reason");
    const calls = getCalls();
    // Should have: lock channel, rename channel, post close notice, update staff embed
    const urls = calls.map((c) => c.url);
    assert(urls.some((u) => u.includes("channels/ch1/permissions/g1")), "Should lock channel");
    assert(urls.some((u) => u.includes("channels/ch1/messages")), "Should post close notice");
    assert(urls.some((u) => u.includes("channels/staff_ch/messages/smsg1")), "Should update staff embed");
  } finally {
    restoreFetch();
  }
});

// --- /ticket new subcommand ---

Deno.test("ticket new: returns error when not configured", async () => {
  resetStore();
  const result = await ticketCommand.execute(makeCtx({ options: { subcommand: "new", channelId: "ch1", interactionToken: "t", interactionId: "i" } }));
  assertEquals(result.success, false);
  assert(result.error!.includes("not configured"));
});

Deno.test("ticket new: returns error when at ticket limit", async () => {
  resetStore();
  await guildConfig.setTicketConfig("g1", "staff_ch", "cat1");
  // Create 3 open tickets for user
  for (let i = 1; i <= 3; i++) {
    await kv.set(ticketKey("g1", `ch${i}`), makeTicket({ channelId: `ch${i}`, userId: "u1", status: "open" }));
  }

  const result = await ticketCommand.execute(makeCtx({ options: { subcommand: "new", channelId: "ch_any", interactionToken: "t", interactionId: "i" } }));
  assertEquals(result.success, false);
  assert(result.error!.includes("3"));
});

Deno.test("ticket new: returns modal when valid", async () => {
  resetStore();
  await guildConfig.setTicketConfig("g1", "staff_ch", "cat1");

  const result = await ticketCommand.execute(makeCtx({ options: { subcommand: "new", channelId: "ch1", interactionToken: "t", interactionId: "i" } }));
  assertEquals(result.success, true);
  assert(result.modal !== undefined);
  assertEquals(result.modal!.custom_id, "ticket-modal:g1");
  assertEquals(result.modal!.title, "New Support Ticket");
});

// --- /ticket close subcommand ---

Deno.test("ticket close: returns error when not a ticket channel", async () => {
  resetStore();
  const result = await ticketCommand.execute(makeCtx({ options: { subcommand: "close", channelId: "random_ch", interactionToken: "t", interactionId: "i" } }));
  assertEquals(result.success, false);
  assert(result.error!.includes("not a ticket"));
});

Deno.test("ticket close: returns error when already closed", async () => {
  resetStore();
  await kv.set(ticketKey("g1", "ch1"), makeTicket({ status: "closed" }));
  const result = await ticketCommand.execute(makeCtx({ options: { subcommand: "close", channelId: "ch1", interactionToken: "t", interactionId: "i" } }));
  assertEquals(result.success, false);
  assert(result.error!.includes("already closed"));
});

Deno.test("ticket close: successfully closes open ticket", async () => {
  resetStore();
  await kv.set(ticketKey("g1", "ch1"), makeTicket());
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const result = await ticketCommand.execute(makeCtx({ options: { subcommand: "close", channelId: "ch1", reason: "Fixed", interactionToken: "t", interactionId: "i" } }));
    assertEquals(result.success, true);
    assert(result.message!.includes("closed"));
  } finally {
    restoreFetch();
  }
});

// --- /ticket setup subcommand ---

Deno.test("ticket setup: rejects non-admin", async () => {
  resetStore();
  const result = await ticketCommand.execute(makeCtx({
    userId: "non_admin",
    options: { subcommand: "setup", "staff-channel": "sc1", category: "cat1", channelId: "ch", interactionToken: "t", interactionId: "i" },
    memberRoles: [],
    memberPermissions: "0",
  }));
  assertEquals(result.success, false);
  assert(result.error!.includes("admin"));
});

Deno.test("ticket setup: succeeds for admin", async () => {
  resetStore();
  // ADMINISTRATOR permission bit
  const result = await ticketCommand.execute(makeCtx({
    options: { subcommand: "setup", "staff-channel": "sc1", category: "cat1", channelId: "ch", interactionToken: "t", interactionId: "i" },
    memberPermissions: "8",
  }));
  assertEquals(result.success, true);
  assert(result.message!.includes("configured"));

  // Verify config was saved
  const config = await guildConfig.getTicketConfig("g1");
  assertEquals(config.staffChannelId, "sc1");
  assertEquals(config.categoryId, "cat1");
});

// --- Command metadata ---

Deno.test("ticket command: metadata is correct", () => {
  assertEquals(ticketCommand.name, "ticket");
  assertEquals(ticketCommand.deferred, false);
  assertEquals(ticketCommand.registration.type, "guild");
});

Deno.test("ticket command: has 3 subcommands", () => {
  assertEquals(ticketCommand.options?.length, 3);
  const names = ticketCommand.options!.map((o) => o.name);
  assert(names.includes("new"));
  assert(names.includes("close"));
  assert(names.includes("setup"));
});
