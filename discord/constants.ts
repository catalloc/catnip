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
  appOwnerId: Deno.env.get("DISCORD_APP_OWNER_ID") ?? "",
  discordConsoleWebhook: Deno.env.get("DISCORD_CONSOLE") ?? null,
  clientSecret: Deno.env.get("DISCORD_CLIENT_SECRET") ?? "",
  adminPassword: Deno.env.get("ADMIN_PASSWORD") ?? "",
  steamApiKey: Deno.env.get("STEAM_API_KEY") ?? "",
  patreonWebhookSecret: Deno.env.get("PATREON_WEBHOOK_SECRET") ?? "",
} as const;

/** Discord ADMINISTRATOR permission bit */
const ADMINISTRATOR_BIT = 0x8n;

/**
 * Check if a user is a guild admin. Checks (in order):
 * 1. Global bot owner (CONFIG.appOwnerId)
 * 2. Discord ADMINISTRATOR permission (from member permissions bitfield)
 * 3. Per-guild admin roles from guild config
 */
export async function isGuildAdmin(
  guildId: string,
  userId: string,
  memberRoles: string[],
  memberPermissions?: string,
): Promise<boolean> {
  // 1. Global bot owner
  if (CONFIG.appOwnerId && userId === CONFIG.appOwnerId) return true;

  // 2. Discord ADMINISTRATOR permission
  if (memberPermissions) {
    try {
      const perms = BigInt(memberPermissions);
      if ((perms & ADMINISTRATOR_BIT) === ADMINISTRATOR_BIT) return true;
    } catch {
      // Invalid permissions string — skip
    }
  }

  // 3. Per-guild admin roles (lazy import to avoid circular deps at module load)
  const { guildConfig } = await import("./persistence/guild-config.ts");
  const adminRoleIds = await guildConfig.getAdminRoleIds(guildId);
  if (adminRoleIds.length > 0 && memberRoles.some((r) => adminRoleIds.includes(r))) {
    return true;
  }

  return false;
}

export const EmbedColors = {
  SUCCESS: 0x57f287,
  ERROR: 0xed4245,
  INFO: 0x5865f2,
  WARNING: 0xfee75c,
} as const;
