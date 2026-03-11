/**
 * Livestream Notifier - Admin command for tracking streamers across platforms
 *
 * Subcommands:
 *   /livestream add <platform> <username> <channel> [display-name]
 *   /livestream remove <platform> <username>
 *   /livestream list
 *
 * File: discord/interactions/commands/livestream.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { EmbedColors } from "../../constants.ts";
import { kv } from "../../persistence/kv.ts";
import type { Platform } from "../../services/stream-platforms.ts";

const MAX_TRACKERS_PER_GUILD = 25;

export interface StreamTracker {
  guildId: string;
  platform: Platform;
  username: string;
  displayName: string;
  channelId: string;
  addedBy: string;
  addedAt: string;
}

export function streamKey(guildId: string, platform: string, username: string): string {
  return `stream:${guildId}:${platform}:${username.toLowerCase()}`;
}

export function streamLiveKey(guildId: string, platform: string, username: string): string {
  return `stream_live:${guildId}:${platform}:${username.toLowerCase()}`;
}

const PLATFORM_LABELS: Record<Platform, string> = {
  twitch: "Twitch",
  youtube: "YouTube",
  kick: "Kick",
};

export default defineCommand({
  name: "livestream",
  description: "Admin: Track streamers and get notified when they go live",

  options: [
    {
      name: "add",
      description: "Add a streamer to track",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "platform",
          description: "Streaming platform",
          type: OptionTypes.STRING,
          required: true,
          choices: [
            { name: "Twitch", value: "twitch" },
            { name: "YouTube", value: "youtube" },
            { name: "Kick", value: "kick" },
          ],
        },
        {
          name: "username",
          description: "Streamer username (Twitch login / YouTube channel ID / Kick username)",
          type: OptionTypes.STRING,
          required: true,
          max_length: 100,
        },
        {
          name: "channel",
          description: "Discord channel to post notifications in",
          type: OptionTypes.CHANNEL,
          required: true,
        },
        {
          name: "display-name",
          description: "Friendly display name for embeds (defaults to username)",
          type: OptionTypes.STRING,
          required: false,
          max_length: 100,
        },
      ],
    },
    {
      name: "remove",
      description: "Stop tracking a streamer",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "platform",
          description: "Streaming platform",
          type: OptionTypes.STRING,
          required: true,
          choices: [
            { name: "Twitch", value: "twitch" },
            { name: "YouTube", value: "youtube" },
            { name: "Kick", value: "kick" },
          ],
        },
        {
          name: "username",
          description: "Streamer username to remove",
          type: OptionTypes.STRING,
          required: true,
          max_length: 100,
        },
      ],
    },
    {
      name: "list",
      description: "List all tracked streamers",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
  ],

  registration: { type: "guild" },
  adminOnly: true,
  deferred: true,
  ephemeral: true,

  async execute({ guildId, userId, options }) {
    const sub = options?.subcommand as string | undefined;

    if (sub === "add") {
      const platform = options.platform as Platform;
      const username = (options.username as string).trim();
      const channelId = options.channel as string;
      const displayName = (options["display-name"] as string | undefined)?.trim() || username;

      if (!username) {
        return { success: false, error: "Username cannot be empty." };
      }

      const key = streamKey(guildId, platform, username);

      // Check per-guild limit (fast-fail; off-by-one under extreme concurrency is acceptable)
      const allTrackers = await kv.list(`stream:${guildId}:`);
      if (allTrackers.length >= MAX_TRACKERS_PER_GUILD) {
        return {
          success: false,
          error: `You've reached the maximum of ${MAX_TRACKERS_PER_GUILD} tracked streamers. Remove some before adding more.`,
        };
      }

      const tracker: StreamTracker = {
        guildId,
        platform,
        username: username.toLowerCase(),
        displayName,
        channelId,
        addedBy: userId,
        addedAt: new Date().toISOString(),
      };

      // Atomic check-and-insert: kv.update uses INSERT OR IGNORE for new keys
      // and CAS UPDATE for existing keys, preventing duplicate creation races
      let alreadyExists = false;
      const result = await kv.update<StreamTracker>(key, (current) => {
        if (current) {
          alreadyExists = true;
          return current; // Don't overwrite existing tracker
        }
        return tracker;
      });

      if (alreadyExists) {
        return {
          success: false,
          error: `**${displayName}** on ${PLATFORM_LABELS[platform]} is already being tracked in <#${result.channelId}>.`,
        };
      }

      return {
        success: true,
        message: `Now tracking **${displayName}** on ${PLATFORM_LABELS[platform]} in <#${channelId}>.`,
        action: "added",
      };
    }

    if (sub === "remove") {
      const platform = options.platform as Platform;
      const username = (options.username as string).trim();

      const key = streamKey(guildId, platform, username);
      const existing = await kv.get<StreamTracker>(key);
      if (!existing) {
        return {
          success: false,
          error: `No tracker found for **${username}** on ${PLATFORM_LABELS[platform]}.`,
        };
      }

      // Delete both config and live state keys
      await Promise.all([
        kv.delete(key),
        kv.delete(streamLiveKey(guildId, platform, username)),
      ]);

      return {
        success: true,
        message: `Stopped tracking **${existing.displayName}** on ${PLATFORM_LABELS[platform]}.`,
        action: "removed",
      };
    }

    if (sub === "list") {
      const entries = await kv.list(`stream:${guildId}:`);

      if (entries.length === 0) {
        return { success: true, message: "No streamers are being tracked in this server." };
      }

      const trackers = entries
        .map((e) => e.value as StreamTracker)
        .filter((t) => t?.platform && t?.username);

      const grouped: Record<string, StreamTracker[]> = {};
      for (const t of trackers) {
        const label = PLATFORM_LABELS[t.platform] ?? t.platform;
        (grouped[label] ??= []).push(t);
      }

      const fields = Object.entries(grouped).map(([platform, items]) => ({
        name: platform,
        value: items
          .map((t) => `\`${t.displayName}\` → <#${t.channelId}>`)
          .join("\n"),
        inline: false,
      }));

      return {
        success: true,
        embed: {
          title: "Tracked Streamers",
          color: EmbedColors.INFO,
          fields,
          footer: { text: `${trackers.length}/${MAX_TRACKERS_PER_GUILD} slots used` },
        },
      };
    }

    return { success: false, error: "Please use a subcommand: add, remove, or list." };
  },
});
