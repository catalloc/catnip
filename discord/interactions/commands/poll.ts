/**
 * Polls - Admin command for running button-based polls
 *
 * Subcommands:
 *   /poll create <question> <options> <channel> [duration]
 *   /poll end
 *
 * File: discord/interactions/commands/poll.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { EmbedColors } from "../../constants.ts";
import { kv } from "../../persistence/kv.ts";
import { discordBotFetch } from "../../discord-api.ts";
import { parseDuration } from "../../helpers/duration.ts";

export interface PollConfig {
  question: string;
  options: string[];
  votes: Record<string, number>; // { odUserId: optionIndex }
  channelId: string;
  messageId: string;
  createdBy: string;
  endsAt: number;
  ended: boolean;
}

const DEFAULT_POLL_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_POLL_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_OPTION_LENGTH = 80;
const CLEANUP_DELAY_MS = 24 * 60 * 60 * 1000; // 24 hours

export function pollKey(guildId: string): string {
  return `poll:${guildId}`;
}

function countVotes(votes: Record<string, number>, optionCount: number): number[] {
  const counts = new Array(optionCount).fill(0);
  for (const idx of Object.values(votes)) {
    if (idx >= 0 && idx < optionCount) counts[idx]++;
  }
  return counts;
}

function buildPollEmbed(config: PollConfig, ended = false) {
  const counts = countVotes(config.votes, config.options.length);
  const totalVotes = Object.keys(config.votes).length;

  const optionLines = config.options.map((opt, i) => {
    if (ended && totalVotes > 0) {
      const pct = Math.round((counts[i] / totalVotes) * 100);
      const barLen = Math.round(pct / 10);
      const bar = "█".repeat(barLen) + "░".repeat(10 - barLen);
      return `${bar} **${opt}** — ${counts[i]} vote${counts[i] !== 1 ? "s" : ""} (${pct}%)`;
    }
    return `🔵 **${opt}** — ${counts[i]} vote${counts[i] !== 1 ? "s" : ""}`;
  });

  const timeText = `Ends <t:${Math.floor(config.endsAt / 1000)}:R>`;

  const description = [
    ...optionLines,
    "",
    `Total votes: ${totalVotes}`,
    ended ? "" : timeText,
  ].filter((line) => line !== "" || !ended).join("\n");

  return {
    title: ended ? "📊 Poll Results" : `📊 ${config.question}`,
    description: ended ? `**${config.question}**\n\n${description}` : description,
    color: ended ? EmbedColors.WARNING : EmbedColors.INFO,
    footer: { text: ended ? "Poll ended" : "Click a button to vote" },
  };
}

export function buildPollComponents(guildId: string, options: string[], ended = false) {
  if (ended) return [];

  const buttons = options.map((opt, i) => ({
    type: 2,
    style: 1, // PRIMARY
    label: opt.length > 80 ? opt.slice(0, 77) + "..." : opt,
    custom_id: `poll-vote:${guildId}:${i}`,
  }));

  // Split into action rows of max 5 buttons each
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push({ type: 1, components: buttons.slice(i, i + 5) });
  }
  return rows;
}

export async function endPoll(guildId: string): Promise<void> {
  const key = pollKey(guildId);

  // Atomically claim the poll — only one caller can transition ended to true
  const config = await kv.claimUpdate<PollConfig>(key, (current) => {
    if (current.ended) return null; // already ended, don't claim
    return { ...current, ended: true };
  });

  if (!config) return; // no poll, already ended, or lost race

  // We exclusively own the ended state — safe to update due_at for delayed cleanup
  await kv.set(key, config, Date.now() + CLEANUP_DELAY_MS);

  const patchResult = await discordBotFetch("PATCH", `channels/${config.channelId}/messages/${config.messageId}`, {
    embeds: [buildPollEmbed(config, true)],
    components: buildPollComponents(guildId, config.options, true),
  });
  if (!patchResult.ok) {
    console.error(`[poll] Failed to update panel for ${guildId}: ${patchResult.error}`);
  }
}

export { buildPollEmbed };

export default defineCommand({
  name: "poll",
  description: "Admin: Run polls with button voting",

  options: [
    {
      name: "create",
      description: "Start a new poll",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "question",
          description: "The poll question",
          type: OptionTypes.STRING,
          required: true,
          max_length: 256,
        },
        {
          name: "options",
          description: "Comma-separated choices (2–10)",
          type: OptionTypes.STRING,
          required: true,
        },
        {
          name: "channel",
          description: "Channel to post the poll in",
          type: OptionTypes.CHANNEL,
          required: true,
        },
        {
          name: "duration",
          description: "Auto-end time (e.g. 1h, 2d). Default: 7 days, max: 30 days.",
          type: OptionTypes.STRING,
          required: false,
        },
      ],
    },
    {
      name: "end",
      description: "End the active poll and show results",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
  ],

  registration: { type: "guild" },
  adminOnly: true,
  ephemeral: false,

  async execute({ guildId, userId, options }) {
    const sub = options?.subcommand as string | undefined;

    if (sub === "create") {
      const question = options.question as string;
      const optionsStr = options.options as string;
      const channelId = options.channel as string;
      const durationStr = options.duration as string | undefined;

      // Parse and validate options
      const choices = optionsStr.split(",").map((s) => {
        const trimmed = s.trim();
        return trimmed.length > MAX_OPTION_LENGTH
          ? trimmed.slice(0, MAX_OPTION_LENGTH - 3) + "..."
          : trimmed;
      }).filter(Boolean);
      if (choices.length < 2) {
        return { success: false, error: "Provide at least 2 comma-separated options." };
      }
      if (choices.length > 10) {
        return { success: false, error: "Maximum 10 options allowed." };
      }
      const uniqueChoices = new Set(choices.map((c) => c.toLowerCase()));
      if (uniqueChoices.size !== choices.length) {
        return { success: false, error: "Duplicate options are not allowed." };
      }

      // Parse optional duration (default 7 days, max 30 days)
      let durationMs = DEFAULT_POLL_DURATION_MS;
      if (durationStr) {
        const ms = parseDuration(durationStr);
        if (!ms || ms > MAX_POLL_DURATION_MS) {
          return { success: false, error: "Invalid duration. Use formats like `1h`, `30m`, `2d`, `1d12h`. Max 30 days." };
        }
        durationMs = ms;
      }
      const endsAt = Date.now() + durationMs;

      // Check for existing active poll
      const existing = await kv.get<PollConfig>(pollKey(guildId));
      if (existing && !existing.ended) {
        return { success: false, error: "There's already an active poll. Use `/poll end` first." };
      }

      const config: PollConfig = {
        question,
        options: choices,
        votes: {},
        channelId,
        messageId: "",
        createdBy: userId,
        endsAt,
        ended: false,
      };

      // Post poll panel
      const post = await discordBotFetch("POST", `channels/${channelId}/messages`, {
        embeds: [buildPollEmbed(config)],
        components: buildPollComponents(guildId, choices),
      });

      if (!post.ok) {
        console.error(`[poll] Failed to post: ${post.error}`);
        return { success: false, error: "Failed to post poll. The bot may lack permissions in that channel." };
      }

      config.messageId = post.data.id;
      await kv.set(pollKey(guildId), config, config.endsAt);

      return { success: true, message: `Poll started in <#${channelId}>! Ends <t:${Math.floor(endsAt / 1000)}:R>.` };
    }

    if (sub === "end") {
      const config = await kv.get<PollConfig>(pollKey(guildId));
      if (!config || config.ended) {
        return { success: false, error: "No active poll to end." };
      }

      await endPoll(guildId);
      const totalVotes = Object.keys(config.votes).length;
      return { success: true, message: `Poll ended! ${totalVotes} total vote${totalVotes !== 1 ? "s" : ""}.` };
    }

    return { success: false, error: "Please use a subcommand: create or end." };
  },
});
