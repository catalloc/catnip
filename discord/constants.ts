/**
 * discord/constants.ts
 *
 * Centralized configuration. Required env vars throw at module load —
 * the bot cannot function without them.
 */

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const CONFIG = {
  appId: requireEnv("DISCORD_APP_ID"),
  publicKey: requireEnv("DISCORD_PUBLIC_KEY"),
  botToken: requireEnv("DISCORD_BOT_TOKEN"),
  guildId: requireEnv("DISCORD_GUILD_ID"),
  appOwnerId: Deno.env.get("DISCORD_APP_OWNER_ID") ?? "",
  adminRoleId: Deno.env.get("DISCORD_ADMIN_ROLE_ID") ?? "",
  discordConsoleWebhook: Deno.env.get("DISCORD_CONSOLE") ?? null,
  clientSecret: Deno.env.get("DISCORD_CLIENT_SECRET") ?? "",
  adminPassword: Deno.env.get("ADMIN_PASSWORD") ?? "",
  steamApiKey: Deno.env.get("STEAM_API_KEY") ?? "",
  patreonWebhookSecret: Deno.env.get("PATREON_WEBHOOK_SECRET") ?? "",
} as const;

export const ADMIN_ROLE_ID = CONFIG.adminRoleId;

export const EmbedColors = {
  SUCCESS: 0x57f287,
  ERROR: 0xed4245,
  INFO: 0x5865f2,
  WARNING: 0xfee75c,
} as const;
