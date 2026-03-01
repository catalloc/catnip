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

const CLEANUP_DELAY_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface GiveawayConfig {
  prize: string;
  channelId: string;
  messageId: string;
  endsAt: number;
  winnersCount: number;
  entrants: string[];
  ended: boolean;
  winners?: string[];
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

export async function endGiveaway(guildId: string): Promise<void> {
  const key = giveawayKey(guildId);

  // Atomically claim the giveaway — only one caller can transition ended to true
  const config = await kv.claimUpdate<GiveawayConfig>(key, (current) => {
    if (current.ended) return null; // already ended, don't claim
    const winners = pickWinners(current.entrants, current.winnersCount);
    return { ...current, ended: true, winners };
  });

  if (!config) return; // no giveaway, already ended, or lost race

  // We exclusively own the ended state — safe to update due_at for delayed cleanup
  await kv.set(key, config, Date.now() + CLEANUP_DELAY_MS);

  // Update panel embed
  await discordBotFetch("PATCH", `channels/${config.channelId}/messages/${config.messageId}`, {
    embeds: [buildGiveawayEmbed(config, true)],
    components: buildGiveawayComponents(guildId, true),
  });

  // Announce winners
  const winnerText = config.winners!.length > 0
    ? `Congratulations ${config.winners!.map((id) => `<@${id}>`).join(", ")}! You won **${config.prize}**!`
    : `No one entered the giveaway for **${config.prize}**.`;
  await discordBotFetch("POST", `channels/${config.channelId}/messages`, {
    content: `🎉 **Giveaway Ended!**\n${winnerText}`,
  });
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
        console.error(`[giveaway] Failed to post: ${post.error}`);
        return { success: false, error: "Failed to post giveaway. The bot may lack permissions in that channel." };
      }

      config.messageId = post.data.id;
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
      const config = await kv.get<GiveawayConfig>(giveawayKey(guildId));
      if (!config) {
        return { success: false, error: "No giveaway found." };
      }
      if (!config.ended) {
        return { success: false, error: "The giveaway is still active. Use `/giveaway end` first." };
      }
      if (config.entrants.length === 0) {
        return { success: false, error: "No entrants to reroll from." };
      }

      const newWinners = pickWinners(config.entrants, config.winnersCount);
      config.winners = newWinners;
      await kv.set(giveawayKey(guildId), config, Date.now() + CLEANUP_DELAY_MS);

      // Update panel
      await discordBotFetch("PATCH", `channels/${config.channelId}/messages/${config.messageId}`, {
        embeds: [buildGiveawayEmbed(config, true)],
      });

      // Announce new winners
      const winnerText = newWinners.map((id) => `<@${id}>`).join(", ");
      await discordBotFetch("POST", `channels/${config.channelId}/messages`, {
        content: `🎉 **Giveaway Rerolled!** New winner(s): ${winnerText} for **${config.prize}**!`,
      });

      return { success: true, message: `Rerolled! New winners: ${winnerText}` };
    }

    return { success: false, error: "Please use a subcommand: create, end, or reroll." };
  },
});
