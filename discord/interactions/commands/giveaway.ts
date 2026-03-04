/**
 * Giveaways - Admin command for running giveaways with button entry
 *
 * Subcommands:
 *   /giveaway create <prize> <duration> <winners> <channel>
 *   /giveaway end
 *   /giveaway reroll
 *
 * File: discord/interactions/commands/giveaway.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { EmbedColors } from "../../constants.ts";
import { kv } from "../../persistence/kv.ts";
import { discordBotFetch } from "../../discord-api.ts";
import { parseDuration } from "../../helpers/duration.ts";
import { secureRandomIndex } from "../../helpers/crypto.ts";
import { createLogger } from "../../webhook/logger.ts";

const logger = createLogger("Giveaway");

const CLEANUP_DELAY_MS = 24 * 60 * 60 * 1000; // 24 hours
const ANNOUNCE_RETRY_DELAY_MS = 15 * 60 * 1000; // 15 minutes
export const MAX_ANNOUNCE_RETRIES = 3;

export interface GiveawayConfig {
  prize: string;
  channelId: string;
  messageId: string;
  endsAt: number;
  winnersCount: number;
  entrants: string[];
  ended: boolean;
  winners?: string[];
  lastPanelUpdate?: number;
  announceFailed?: boolean;
  announceRetries?: number;
}

export function giveawayKey(guildId: string): string {
  return `giveaway:${guildId}`;
}

function buildGiveawayEmbed(config: GiveawayConfig, ended = false) {
  const unixSeconds = Math.floor(config.endsAt / 1000);
  const description = ended
    ? [
        `**Prize:** ${config.prize}`,
        `**Winners:** ${config.winners?.length ? config.winners.map((id) => `<@${id}>`).join(", ") : "Not enough entrants"}`,
        `**Entries:** ${config.entrants.length}`,
      ].join("\n")
    : [
        `**Prize:** ${config.prize}`,
        `**Ends:** <t:${unixSeconds}:R>`,
        `**Entries:** ${config.entrants.length}`,
        `**Winners:** ${config.winnersCount}`,
        "",
        "Click the button below to enter!",
      ].join("\n");

  return {
    title: ended ? "🎉 Giveaway Ended" : "🎉 Giveaway",
    description,
    color: ended ? EmbedColors.WARNING : EmbedColors.INFO,
    footer: { text: ended ? "This giveaway has ended" : `${config.winnersCount} winner(s) will be chosen` },
  };
}

function buildGiveawayComponents(guildId: string, ended = false) {
  if (ended) return [];
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 1, // PRIMARY (blurple)
          label: "Enter Giveaway",
          emoji: { name: "🎉" },
          custom_id: `giveaway-enter:${guildId}`,
        },
      ],
    },
  ];
}

export function pickWinners(entrants: string[], count: number): string[] {
  if (entrants.length === 0) return [];
  const pool = [...entrants];
  const winners: string[] = [];
  const picks = Math.min(count, pool.length);
  for (let i = 0; i < picks; i++) {
    const idx = secureRandomIndex(pool.length);
    winners.push(pool.splice(idx, 1)[0]);
  }
  return winners;
}

/**
 * Attempt to send the giveaway end announcement (embed update + winner message).
 * Returns true if all Discord API calls succeeded.
 */
export async function announceGiveaway(guildId: string, config: GiveawayConfig): Promise<boolean> {
  let success = true;

  const patchResult = await discordBotFetch("PATCH", `channels/${config.channelId}/messages/${config.messageId}`, {
    embeds: [buildGiveawayEmbed(config, true)],
    components: buildGiveawayComponents(guildId, true),
  });
  if (!patchResult.ok) {
    logger.error(`Failed to update panel for ${guildId}: ${patchResult.error}`);
    success = false;
  }

  const winnerText = config.winners!.length > 0
    ? `Congratulations ${config.winners!.map((id) => `<@${id}>`).join(", ")}! You won **${config.prize}**!`
    : `No one entered the giveaway for **${config.prize}**.`;
  const postResult = await discordBotFetch("POST", `channels/${config.channelId}/messages`, {
    content: `🎉 **Giveaway Ended!**\n${winnerText}`,
  });
  if (!postResult.ok) {
    logger.error(`Failed to announce winners for ${guildId}: ${postResult.error}`);
    success = false;
  }

  return success;
}

export async function endGiveaway(guildId: string): Promise<void> {
  const key = giveawayKey(guildId);

  // Atomically claim the giveaway — only one caller can transition ended to true
  // Set announceFailed:true as a fail-safe so crash between claim and announce is retried by cron
  const config = await kv.claimUpdate<GiveawayConfig>(key, (current) => {
    if (current.ended) return null; // already ended, don't claim
    const winners = pickWinners(current.entrants, current.winnersCount);
    return { ...current, ended: true, winners, announceFailed: true, announceRetries: 0 };
  });

  if (!config) return; // no giveaway, already ended, or lost race

  const announced = await announceGiveaway(guildId, config);
  if (announced) {
    // Success — clear fail-safe flag and schedule cleanup
    const { announceFailed: _, announceRetries: __, ...clean } = config;
    await kv.set(key, clean, Date.now() + CLEANUP_DELAY_MS);
  } else {
    // Override with retry schedule so the cron re-attempts the announcement
    // announceFailed is already set from claimUpdate
    try {
      await kv.set(key, config, Date.now() + ANNOUNCE_RETRY_DELAY_MS);
    } catch {
      logger.error(`Failed to schedule announce retry for giveaway ${guildId}`);
    }
  }
}

export default defineCommand({
  name: "giveaway",
  description: "Admin: Run giveaways with button entry",

  options: [
    {
      name: "create",
      description: "Start a new giveaway",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "prize",
          description: "What are you giving away?",
          type: OptionTypes.STRING,
          required: true,
          max_length: 256,
        },
        {
          name: "duration",
          description: "How long (e.g. 1h, 2d, 1d12h)",
          type: OptionTypes.STRING,
          required: true,
        },
        {
          name: "channel",
          description: "Channel to post the giveaway in",
          type: OptionTypes.CHANNEL,
          required: true,
        },
        {
          name: "winners",
          description: "Number of winners (default: 1, max: 10)",
          type: OptionTypes.INTEGER,
          required: false,
        },
      ],
    },
    {
      name: "end",
      description: "End the current giveaway early",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
    {
      name: "reroll",
      description: "Pick new winner(s) from the ended giveaway",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
  ],

  registration: { type: "guild" },
  adminOnly: true,
  ephemeral: false,

  async execute({ guildId, options }) {
    const sub = options?.subcommand as string | undefined;

    if (sub === "create") {
      const prize = options.prize as string;
      const durationStr = options.duration as string;
      const channelId = options.channel as string;
      const winnersCount = Math.min(Math.max((options.winners as number) || 1, 1), 10);

      const ms = parseDuration(durationStr);
      if (!ms) {
        return { success: false, error: "Invalid duration. Use formats like `1h`, `30m`, `2d`, `1d12h`. Max 30 days." };
      }
      if (ms < 60_000) {
        return { success: false, error: "Giveaway duration must be at least 1 minute." };
      }

      // Check for existing active giveaway
      const existing = await kv.get<GiveawayConfig>(giveawayKey(guildId));
      if (existing && !existing.ended) {
        return { success: false, error: "There's already an active giveaway. Use `/giveaway end` first." };
      }

      const endsAt = Date.now() + ms;
      const config: GiveawayConfig = {
        prize,
        channelId,
        messageId: "",
        endsAt,
        winnersCount,
        entrants: [],
        ended: false,
      };

      // Post giveaway panel
      const post = await discordBotFetch("POST", `channels/${channelId}/messages`, {
        embeds: [buildGiveawayEmbed(config)],
        components: buildGiveawayComponents(guildId),
      });

      if (!post.ok) {
        logger.error(`[guild:${guildId} channel:${channelId}] Failed to post: ${post.error}`);
        return { success: false, error: "Failed to post giveaway. The bot may lack permissions in that channel." };
      }

      config.messageId = post.data.id;

      // Race guard: re-check after posting (narrows TOCTOU to microseconds)
      const raceCheck = await kv.get<GiveawayConfig>(giveawayKey(guildId));
      if (raceCheck && !raceCheck.ended) {
        // Another admin created one while we were posting — clean up orphaned message
        await discordBotFetch("DELETE", `channels/${channelId}/messages/${config.messageId}`).catch((err) => logger.warn("Failed to clean up orphaned giveaway message:", err));
        return { success: false, error: "A giveaway was just created by another admin. Please try again." };
      }

      await kv.set(giveawayKey(guildId), config, config.endsAt);

      const unixSeconds = Math.floor(endsAt / 1000);
      return { success: true, message: `Giveaway for **${prize}** started in <#${channelId}>! Ends <t:${unixSeconds}:R>.` };
    }

    if (sub === "end") {
      const config = await kv.get<GiveawayConfig>(giveawayKey(guildId));
      if (!config || config.ended) {
        return { success: false, error: "No active giveaway to end." };
      }

      await endGiveaway(guildId);
      return { success: true, message: "Giveaway ended! Winners have been announced." };
    }

    if (sub === "reroll") {
      // Pre-checks for fast UX feedback
      const existing = await kv.get<GiveawayConfig>(giveawayKey(guildId));
      if (!existing) {
        return { success: false, error: "No giveaway found." };
      }
      if (!existing.ended) {
        return { success: false, error: "The giveaway is still active. Use `/giveaway end` first." };
      }
      if (existing.entrants.length === 0) {
        return { success: false, error: "No entrants to reroll from." };
      }

      // Atomic CAS update for reroll — also clears any pending retry state
      let updated: GiveawayConfig;
      try {
        updated = await kv.update<GiveawayConfig>(giveawayKey(guildId), (current) => {
          if (!current || !current.ended) return current!;
          const newWinners = pickWinners(current.entrants, current.winnersCount);
          const { announceFailed: _, announceRetries: __, ...clean } = current;
          return { ...clean, winners: newWinners };
        });
      } catch {
        return { success: false, error: "Reroll failed due to a conflict. Please try again." };
      }

      // Update panel
      const patchRes = await discordBotFetch("PATCH", `channels/${updated.channelId}/messages/${updated.messageId}`, {
        embeds: [buildGiveawayEmbed(updated, true)],
      });
      if (!patchRes.ok) {
        logger.error(`Failed to update reroll panel for ${guildId}: ${patchRes.error}`);
      }

      // Reset due_at to cleanup delay (cancels any pending retry schedule)
      await kv.set(giveawayKey(guildId), updated, Date.now() + CLEANUP_DELAY_MS);

      // Announce new winners
      const winnerText = updated.winners!.map((id) => `<@${id}>`).join(", ");
      const postRes = await discordBotFetch("POST", `channels/${updated.channelId}/messages`, {
        content: `🎉 **Giveaway Rerolled!** New winner(s): ${winnerText} for **${updated.prize}**!`,
      });
      if (!postRes.ok) {
        logger.error(`Failed to announce reroll for ${guildId}: ${postRes.error}`);
      }

      return { success: true, message: `Rerolled! New winners: ${winnerText}` };
    }

    return { success: false, error: "Please use a subcommand: create, end, or reroll." };
  },
});
