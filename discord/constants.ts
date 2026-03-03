/**
 * discord/constants.ts
 *
 * Centralized configuration.
 * Required env vars throw at module load — the bot cannot function without them.
 * Optional env vars use lazy getters — Val Town won't warn if they're unset.
 */

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const CONFIG = {
  // --- Required (eager — fail fast at module load) ---
  appId: requireEnv("DISCORD_APP_ID"),
  publicKey: requireEnv("DISCORD_PUBLIC_KEY"),
  botToken: requireEnv("DISCORD_BOT_TOKEN"),

  // --- Optional (lazy — only read when accessed) ---
  get appOwnerId() { return Deno.env.get("DISCORD_APP_OWNER_ID") ?? ""; },
  get discordConsoleWebhook() { return Deno.env.get("DISCORD_CONSOLE") ?? null; },
  get clientSecret() { return Deno.env.get("DISCORD_CLIENT_SECRET") ?? null; },
  get adminPassword() { return Deno.env.get("ADMIN_PASSWORD") ?? null; },
  get steamApiKey() { return Deno.env.get("STEAM_API_KEY") ?? null; },
  get patreonWebhookSecret() { return Deno.env.get("PATREON_WEBHOOK_SECRET") ?? null; },
  get feedbackWebhook() { return Deno.env.get("FEEDBACK_WEBHOOK") ?? null; },
  get twitchClientId() { return Deno.env.get("TWITCH_CLIENT_ID") ?? null; },
  get twitchClientSecret() { return Deno.env.get("TWITCH_CLIENT_SECRET") ?? null; },
  get youtubeApiKey() { return Deno.env.get("YOUTUBE_API_KEY") ?? null; },
  get allowedGuildIds() {
    return (Deno.env.get("ALLOWED_GUILD_IDS") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  },
};

/** Discord ADMINISTRATOR permission bit */
const ADMINISTRATOR_BIT = 0x8n;

let guildConfigModule: typeof import("./persistence/guild-config.ts") | null = null;

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
  guildConfigModule ??= await import("./persistence/guild-config.ts");
  const adminRoleIds = await guildConfigModule.guildConfig.getAdminRoleIds(guildId);
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
