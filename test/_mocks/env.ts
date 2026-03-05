/**
 * test/_mocks/env.ts
 *
 * Side-effect module: sets required env vars for testing.
 * Import this BEFORE any source modules that depend on discord/constants.ts.
 */

const testEnv: Record<string, string> = {
  DISCORD_APP_ID: "11111111111111111",
  DISCORD_PUBLIC_KEY: "e9ed0f268572a36c4dbf24af61334541c051ebdf2b5b44fc32ae071b21186d48",
  DISCORD_BOT_TOKEN: "test_bot_token",
  DISCORD_CLIENT_SECRET: "test_client_secret",
  ADMIN_PASSWORD: "test_admin_password",
};

for (const [key, value] of Object.entries(testEnv)) {
  if (!Deno.env.get(key)) {
    Deno.env.set(key, value);
  }
}
