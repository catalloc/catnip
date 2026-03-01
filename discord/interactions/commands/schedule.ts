/**
 * Scheduled Messages - Admin command for time-delayed message delivery
 *
 * Subcommands:
 *   /schedule send <channel> <time> <message>
 *   /schedule list
 *   /schedule cancel <id>
 *
 * File: discord/interactions/commands/schedule.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { ADMIN_ROLE_ID, CONFIG } from "../../constants.ts";
import { kv } from "../../persistence/kv.ts";
import { parseDuration } from "../../helpers/duration.ts";

export interface ScheduledMessage {
  guildId: string;
  channelId: string;
  content: string;
  sendAt: number;
  createdBy: string;
  createdAt: number;
}

const MAX_SCHEDULED_PER_GUILD = 25;
const KV_PREFIX = "scheduled-msg:";

function kvPrefix(guildId: string): string {
  return `${KV_PREFIX}${guildId}:`;
}

export { KV_PREFIX };

export default defineCommand({
  name: "schedule",
  description: "Admin: Schedule messages for later delivery",

  options: [
    {
      name: "send",
      description: "Schedule a message",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "channel",
          description: "Channel to post in",
          type: OptionTypes.CHANNEL,
          required: true,
        },
        {
          name: "time",
          description: "Delay before sending (e.g. 30m, 2h, 1d)",
          type: OptionTypes.STRING,
          required: true,
        },
        {
          name: "message",
          description: "Message content to send",
          type: OptionTypes.STRING,
          required: true,
        },
      ],
    },
    {
      name: "list",
      description: "Show pending scheduled messages",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
    {
      name: "cancel",
      description: "Cancel a pending message",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "id",
          description: "Message ID to cancel",
          type: OptionTypes.STRING,
          required: true,
          autocomplete: true,
        },
      ],
    },
  ],

  registration: { type: "guild", servers: ["MAIN"] },

  permissions: {
    users: [CONFIG.appOwnerId],
    roles: [ADMIN_ROLE_ID],
  },

  async execute({ guildId, userId, options }) {
    const sub = options?.subcommand as string | undefined;

    if (sub === "send") {
      const channelId = options.channel as string;
      const timeStr = options.time as string;
      const content = options.message as string;

      const ms = parseDuration(timeStr);
      if (!ms) {
        return { success: false, error: "Invalid time. Use formats like `30m`, `2h`, `1d`, `1d12h`. Max 30 days." };
      }

      // Check guild limit
      const existing = await kv.list(kvPrefix(guildId));
      if (existing.length >= MAX_SCHEDULED_PER_GUILD) {
        return { success: false, error: `Maximum ${MAX_SCHEDULED_PER_GUILD} scheduled messages per server. Cancel some first.` };
      }

      const now = Date.now();
      const sendAt = now + ms;
      const randomSuffix = crypto.randomUUID().slice(0, 8);
      const key = `${kvPrefix(guildId)}${now}-${randomSuffix}`;

      const msg: ScheduledMessage = {
        guildId,
        channelId,
        content,
        sendAt,
        createdBy: userId,
        createdAt: now,
      };

      await kv.set(key, msg, sendAt);

      const unixSeconds = Math.floor(sendAt / 1000);
      return { success: true, message: `Message scheduled for <#${channelId}> <t:${unixSeconds}:R>.` };
    }

    if (sub === "list") {
      const entries = await kv.list(kvPrefix(guildId));
      if (entries.length === 0) {
        return { success: true, message: "No scheduled messages." };
      }

      const lines = entries
        .map((e) => {
          const msg = e.value as ScheduledMessage;
          const unixSeconds = Math.floor(msg.sendAt / 1000);
          const preview = msg.content.length > 40 ? msg.content.slice(0, 37) + "..." : msg.content;
          return `• <#${msg.channelId}>: "${preview}" — <t:${unixSeconds}:R>`;
        })
        .join("\n");

      return { success: true, message: `**Scheduled messages (${entries.length}):**\n${lines}` };
    }

    if (sub === "cancel") {
      const id = options.id as string;

      // Validate the key belongs to this guild
      if (!id.startsWith(kvPrefix(guildId))) {
        return { success: false, error: "Invalid message ID." };
      }

      const msg = await kv.get<ScheduledMessage>(id);
      if (!msg) {
        return { success: false, error: "Scheduled message not found." };
      }

      await kv.delete(id);
      return { success: true, message: "Scheduled message cancelled." };
    }

    return { success: false, error: "Please use a subcommand: send, list, or cancel." };
  },

  autocomplete(body) {
    const focused = body.data?.options?.[0]?.options?.find((o: any) => o.focused);
    if (!focused || focused.name !== "id") {
      return Response.json({ type: 8, data: { choices: [] } });
    }

    const guildId = body.guild_id as string;
    const input = (focused.value as string || "").toLowerCase();

    // Return a promise — we need to fetch from KV
    return (async () => {
      const entries = await kv.list(kvPrefix(guildId));
      const choices = entries
        .map((e) => {
          const msg = e.value as ScheduledMessage;
          const timeLeft = msg.sendAt - Date.now();
          const hours = Math.floor(timeLeft / 3_600_000);
          const mins = Math.floor((timeLeft % 3_600_000) / 60_000);
          const timeStr = hours > 0 ? `in ${hours}h${mins}m` : `in ${mins}m`;
          const preview = msg.content.length > 50 ? msg.content.slice(0, 47) + "..." : msg.content;
          return {
            name: `#${msg.channelId.slice(-4)}: ${preview} (${timeStr})`.slice(0, 100),
            value: e.key,
          };
        })
        .filter((c) => !input || c.name.toLowerCase().includes(input))
        .slice(0, 25);

      return Response.json({ type: 8, data: { choices } });
    })();
  },
});
