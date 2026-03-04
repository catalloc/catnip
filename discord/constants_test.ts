import "../test/_mocks/env.ts";
import "../test/_mocks/sqlite.ts";
import { assertEquals } from "../test/assert.ts";
import { CONFIG, isGuildAdmin } from "./constants.ts";
import { guildConfig } from "./persistence/guild-config.ts";

// --- CONFIG lazy getters ---

Deno.test("CONFIG: required vars are eagerly loaded", () => {
  assertEquals(CONFIG.appId, "test_app_id");
  assertEquals(CONFIG.publicKey, "e9ed0f268572a36c4dbf24af61334541c051ebdf2b5b44fc32ae071b21186d48");
  assertEquals(CONFIG.botToken, "test_bot_token");
});

Deno.test("CONFIG: optional vars reflect current env (lazy)", () => {
  Deno.env.set("DISCORD_APP_OWNER_ID", "lazy_owner");
  assertEquals(CONFIG.appOwnerId, "lazy_owner");

  Deno.env.delete("DISCORD_APP_OWNER_ID");
  assertEquals(CONFIG.appOwnerId, "");
});

Deno.test("CONFIG: unset optional vars return defaults", () => {
  for (const key of ["STEAM_API_KEY", "PATREON_WEBHOOK_SECRET", "ADMIN_PASSWORD", "DISCORD_CONSOLE"]) {
    Deno.env.delete(key);
  }
  assertEquals(CONFIG.steamApiKey, null);
  assertEquals(CONFIG.patreonWebhookSecret, null);
  assertEquals(CONFIG.adminPassword, null);
  assertEquals(CONFIG.discordConsoleWebhook, null);
});

Deno.test("CONFIG: allowedGuildIds parses CSV", () => {
  Deno.env.set("ALLOWED_GUILD_IDS", "111, 222 ,333");
  assertEquals(CONFIG.allowedGuildIds, ["111", "222", "333"]);

  Deno.env.delete("ALLOWED_GUILD_IDS");
  assertEquals(CONFIG.allowedGuildIds, []);
});

// --- isGuildAdmin ---

const TEST_GUILD = "guild_admin_test_456";

Deno.test("isGuildAdmin: returns true for bot owner", async () => {
  Deno.env.set("DISCORD_APP_OWNER_ID", "owner_123");
  const result = await isGuildAdmin(TEST_GUILD, "owner_123", []);
  assertEquals(result, true);
  Deno.env.delete("DISCORD_APP_OWNER_ID");
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
