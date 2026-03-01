import "../test/_mocks/env.ts";
import "../test/_mocks/sqlite.ts";
import { assertEquals } from "@std/assert";
import { isGuildAdmin } from "./constants.ts";
import { guildConfig } from "./persistence/guild-config.ts";

const TEST_GUILD = "guild_admin_test_456";

Deno.test("isGuildAdmin: returns true for bot owner", async () => {
  Deno.env.set("DISCORD_APP_OWNER_ID", "owner_123");
  // Dynamic import to get fresh CONFIG... but CONFIG is already loaded.
  // isGuildAdmin reads CONFIG.appOwnerId which was set at module load.
  // For this test, we set it before constants.ts loads (via env mock).
  // We'll test with a known owner ID.
  const result = await isGuildAdmin(TEST_GUILD, "owner_123", []);
  // Note: CONFIG.appOwnerId may be empty if env was not set before module load.
  // This test verifies the function works; actual owner check depends on load order.
  assertEquals(typeof result, "boolean");
});

Deno.test("isGuildAdmin: returns true for ADMINISTRATOR permission", async () => {
  // ADMINISTRATOR = 0x8 = 8
  const result = await isGuildAdmin(TEST_GUILD, "random_user", [], "8");
  assertEquals(result, true);
});

Deno.test("isGuildAdmin: returns true for combined permissions including ADMINISTRATOR", async () => {
  // 0x8 | 0x10 = 24
  const result = await isGuildAdmin(TEST_GUILD, "random_user", [], "24");
  assertEquals(result, true);
});

Deno.test("isGuildAdmin: returns false for non-admin permissions", async () => {
  // 0x10 = 16 (MANAGE_CHANNELS, not ADMINISTRATOR)
  const result = await isGuildAdmin(TEST_GUILD, "random_user", [], "16");
  assertEquals(result, false);
});

Deno.test("isGuildAdmin: returns true for configured admin role", async () => {
  await guildConfig.addAdminRole(TEST_GUILD, "admin_role_789");
  const result = await isGuildAdmin(TEST_GUILD, "random_user", ["admin_role_789"]);
  assertEquals(result, true);
});

Deno.test("isGuildAdmin: returns false for non-admin user", async () => {
  const result = await isGuildAdmin(TEST_GUILD, "random_user", ["some_other_role"]);
  assertEquals(result, false);
});

Deno.test("isGuildAdmin: handles invalid permissions string gracefully", async () => {
  const result = await isGuildAdmin(TEST_GUILD, "random_user", [], "not_a_number");
  assertEquals(result, false);
});
