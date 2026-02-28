/**
 * test/_mocks/env.ts
 *
 * Side-effect module: sets required env vars for testing.
 * Import this BEFORE any source modules that depend on discord/constants.ts.
 */

const testEnv: Record<string, string> = {
  DISCORD_APP_ID: "test_app_id",
  DISCORD_PUBLIC_KEY: "0".repeat(64),
  DISCORD_BOT_TOKEN: "test_bot_token",
  DISCORD_GUILD_ID: "test_guild_id",
  DISCORD_CLIENT_SECRET: "test_client_secret",
};

for (const [key, value] of Object.entries(testEnv)) {
  if (!Deno.env.get(key)) {
    Deno.env.set(key, value);
  }
}
