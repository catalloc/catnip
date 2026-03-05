import "../../test/_mocks/env.ts";
import "../../test/_mocks/sqlite.ts";
import { assertEquals } from "../../test/assert.ts";
import { guildConfig } from "./guild-config.ts";

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
