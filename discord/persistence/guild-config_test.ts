import "../../test/_mocks/env.ts";
import "../../test/_mocks/sqlite.ts";
import { assertEquals } from "../../test/assert.ts";
import { guildConfig } from "./guild-config.ts";
import { kv } from "../persistence/kv.ts";

const TEST_GUILD = "guild_test_123";

Deno.test("guildConfig: get returns null for unconfigured guild", async () => {
  const config = await guildConfig.get("nonexistent_guild");
  assertEquals(config, null);
});

Deno.test("guildConfig: getAdminRoleIds returns empty for unconfigured guild", async () => {
  const roles = await guildConfig.getAdminRoleIds("nonexistent_guild_2");
  assertEquals(roles, []);
});

Deno.test("guildConfig: getEnabledCommands returns empty for unconfigured guild", async () => {
  const cmds = await guildConfig.getEnabledCommands("nonexistent_guild_3");
  assertEquals(cmds, []);
});

Deno.test("guildConfig: addAdminRole creates config and adds role", async () => {
  const added = await guildConfig.addAdminRole(TEST_GUILD, "role_1");
  assertEquals(added, true);

  const roles = await guildConfig.getAdminRoleIds(TEST_GUILD);
  assertEquals(roles, ["role_1"]);
});

Deno.test("guildConfig: addAdminRole returns false for duplicate", async () => {
  const added = await guildConfig.addAdminRole(TEST_GUILD, "role_1");
  assertEquals(added, false);
});

Deno.test("guildConfig: removeAdminRole removes existing role", async () => {
  const removed = await guildConfig.removeAdminRole(TEST_GUILD, "role_1");
  assertEquals(removed, true);

  const roles = await guildConfig.getAdminRoleIds(TEST_GUILD);
  assertEquals(roles, []);
});

Deno.test("guildConfig: removeAdminRole returns false for non-existent role", async () => {
  const removed = await guildConfig.removeAdminRole(TEST_GUILD, "role_nonexistent");
  assertEquals(removed, false);
});

Deno.test("guildConfig: enableCommand adds command", async () => {
  const enabled = await guildConfig.enableCommand(TEST_GUILD, "tag");
  assertEquals(enabled, true);

  const cmds = await guildConfig.getEnabledCommands(TEST_GUILD);
  assertEquals(cmds.includes("tag"), true);
});

Deno.test("guildConfig: enableCommand returns false for duplicate", async () => {
  const enabled = await guildConfig.enableCommand(TEST_GUILD, "tag");
  assertEquals(enabled, false);
});

Deno.test("guildConfig: disableCommand removes command", async () => {
  const disabled = await guildConfig.disableCommand(TEST_GUILD, "tag");
  assertEquals(disabled, true);

  const cmds = await guildConfig.getEnabledCommands(TEST_GUILD);
  assertEquals(cmds.includes("tag"), false);
});

Deno.test("guildConfig: disableCommand returns false for non-existent", async () => {
  const disabled = await guildConfig.disableCommand(TEST_GUILD, "nonexistent");
  assertEquals(disabled, false);
});

Deno.test("guildConfig: setAdminRoles replaces all roles", async () => {
  await guildConfig.setAdminRoles(TEST_GUILD, ["role_a", "role_b"]);
  const roles = await guildConfig.getAdminRoleIds(TEST_GUILD);
  assertEquals(roles, ["role_a", "role_b"]);
});

Deno.test("guildConfig: listGuilds returns configured guilds", async () => {
  const guilds = await guildConfig.listGuilds();
  const found = guilds.find((g) => g.guildId === TEST_GUILD);
  assertEquals(found !== undefined, true);
  assertEquals(found?.adminRoleIds, ["role_a", "role_b"]);
});

Deno.test("guildConfig: adding 26th admin role fails (MAX_ADMIN_ROLES=25)", async () => {
  const gid = "max_roles_guild";
  const roles = Array.from({ length: 25 }, (_, i) => `role_${i}`);
  await guildConfig.setAdminRoles(gid, roles);
  const added = await guildConfig.addAdminRole(gid, "role_26");
  assertEquals(added, false);
  const stored = await guildConfig.getAdminRoleIds(gid);
  assertEquals(stored.length, 25);
});

Deno.test("guildConfig: adding 51st enabled command fails (MAX_ENABLED_COMMANDS=50)", async () => {
  const gid = "max_cmds_guild";
  for (let i = 0; i < 50; i++) {
    await guildConfig.enableCommand(gid, `cmd_${i}`);
  }
  const enabled = await guildConfig.enableCommand(gid, "cmd_51");
  assertEquals(enabled, false);
  const cmds = await guildConfig.getEnabledCommands(gid);
  assertEquals(cmds.length, 50);
});

// --- Ticket config tests ---

const TICKET_GUILD = "ticket_test_guild";

Deno.test("guildConfig: getTicketConfig returns nulls for unconfigured guild", async () => {
  const config = await guildConfig.getTicketConfig("ticket_unconfigured_guild");
  assertEquals(config.staffChannelId, null);
  assertEquals(config.categoryId, null);
});

Deno.test("guildConfig: setTicketConfig creates new config with ticket fields", async () => {
  await guildConfig.setTicketConfig(TICKET_GUILD, "staff_ch_1", "cat_1");
  const config = await guildConfig.get(TICKET_GUILD);
  assertEquals(config?.ticketStaffChannelId, "staff_ch_1");
  assertEquals(config?.ticketCategoryId, "cat_1");
  assertEquals(config?.guildId, TICKET_GUILD);
});

Deno.test("guildConfig: setTicketConfig updates existing config preserving adminRoleIds", async () => {
  const gid = "ticket_admin_guild";
  await guildConfig.addAdminRole(gid, "role_admin_1");
  await guildConfig.setTicketConfig(gid, "staff_ch_2", "cat_2");
  const config = await guildConfig.get(gid);
  assertEquals(config?.adminRoleIds, ["role_admin_1"]);
  assertEquals(config?.ticketStaffChannelId, "staff_ch_2");
  assertEquals(config?.ticketCategoryId, "cat_2");
});

Deno.test("guildConfig: setTicketConfig preserves enabledCommands", async () => {
  const gid = "ticket_cmds_guild";
  await guildConfig.enableCommand(gid, "tag");
  await guildConfig.enableCommand(gid, "poll");
  await guildConfig.setTicketConfig(gid, "staff_ch_3", "cat_3");
  const cmds = await guildConfig.getEnabledCommands(gid);
  assertEquals(cmds.includes("tag"), true);
  assertEquals(cmds.includes("poll"), true);
});

Deno.test("guildConfig: getTicketConfig round-trip after setTicketConfig", async () => {
  const gid = "ticket_roundtrip_guild";
  await guildConfig.setTicketConfig(gid, "staff_rt", "cat_rt");
  const ticket = await guildConfig.getTicketConfig(gid);
  assertEquals(ticket.staffChannelId, "staff_rt");
  assertEquals(ticket.categoryId, "cat_rt");
});

Deno.test("guildConfig: setTicketConfig updates timestamp", async () => {
  const gid = "ticket_timestamp_guild";
  await guildConfig.setTicketConfig(gid, "staff_ts1", "cat_ts1");
  const before = await guildConfig.get(gid);
  const beforeUpdated = before?.updatedAt;
  // Small delay to ensure timestamp differs
  await new Promise((r) => setTimeout(r, 10));
  await guildConfig.setTicketConfig(gid, "staff_ts2", "cat_ts2");
  const after = await guildConfig.get(gid);
  assertEquals(after?.ticketStaffChannelId, "staff_ts2");
  assertEquals(after?.ticketCategoryId, "cat_ts2");
  assertEquals(beforeUpdated !== after?.updatedAt, true);
});

Deno.test("guildConfig: setTicketConfig overwrites previous ticket config", async () => {
  const gid = "ticket_overwrite_guild";
  await guildConfig.setTicketConfig(gid, "old_staff", "old_cat");
  await guildConfig.setTicketConfig(gid, "new_staff", "new_cat");
  const ticket = await guildConfig.getTicketConfig(gid);
  assertEquals(ticket.staffChannelId, "new_staff");
  assertEquals(ticket.categoryId, "new_cat");
});

Deno.test("guildConfig: getTicketConfig with partial config (only staffChannelId via raw KV)", async () => {
  const gid = "ticket_partial_staff_guild";
  await kv.set(`guild_config:${gid}`, {
    guildId: gid,
    adminRoleIds: [],
    enabledCommands: [],
    ticketStaffChannelId: "partial_staff",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const ticket = await guildConfig.getTicketConfig(gid);
  assertEquals(ticket.staffChannelId, "partial_staff");
  assertEquals(ticket.categoryId, null);
});

Deno.test("guildConfig: getTicketConfig with partial config (only categoryId via raw KV)", async () => {
  const gid = "ticket_partial_cat_guild";
  await kv.set(`guild_config:${gid}`, {
    guildId: gid,
    adminRoleIds: [],
    enabledCommands: [],
    ticketCategoryId: "partial_cat",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const ticket = await guildConfig.getTicketConfig(gid);
  assertEquals(ticket.staffChannelId, null);
  assertEquals(ticket.categoryId, "partial_cat");
});

Deno.test("guildConfig: setTicketConfig on guild with no prior config", async () => {
  const gid = "ticket_fresh_guild";
  // Verify guild has no config
  const before = await guildConfig.get(gid);
  assertEquals(before, null);
  // Set ticket config on fresh guild
  await guildConfig.setTicketConfig(gid, "fresh_staff", "fresh_cat");
  const config = await guildConfig.get(gid);
  assertEquals(config?.guildId, gid);
  assertEquals(config?.ticketStaffChannelId, "fresh_staff");
  assertEquals(config?.ticketCategoryId, "fresh_cat");
  assertEquals(config?.adminRoleIds, []);
  assertEquals(config?.enabledCommands, []);
});
