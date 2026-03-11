/**
 * Remind - Set personal reminders delivered via channel message
 *
 * Usage: /remind duration:1h message:Check the oven
 *
 * File: discord/interactions/commands/remind.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { kv } from "../../persistence/kv.ts";
import { parseDuration } from "../../helpers/duration.ts";

export interface Reminder {
  userId: string;
  guildId: string;
  channelId: string;
  message: string;
  dueAt: number;
  createdAt: number;
  retryCount?: number;
}

const MAX_REMINDERS_PER_USER = 10;

export default defineCommand({
  name: "remind",
  description: "Set a personal reminder",

  options: [
    {
      name: "duration",
      description: "When to remind you (e.g. 10m, 1h, 2d)",
      type: OptionTypes.STRING,
      required: true,
    },
    {
      name: "message",
      description: "What to remind you about",
      type: OptionTypes.STRING,
      required: true,
      max_length: 500,
    },
  ],

  registration: { type: "guild" },
  deferred: false,

  async execute({ guildId, userId, options }) {
    const durationStr = options.duration as string;
    const message = options.message as string;
    const channelId = options.channelId as string;

    const ms = parseDuration(durationStr);
    if (!ms) {
      return { success: false, error: "Invalid duration. Use formats like `10m`, `1h`, `2d`, `1d12h`. Max 30 days." };
    }

    // Check user's active reminder count (scoped prefix avoids scanning all reminders)
    const userReminders = await kv.list(`reminder:${userId}:`);
    if (userReminders.length >= MAX_REMINDERS_PER_USER) {
      return { success: false, error: `You can have at most ${MAX_REMINDERS_PER_USER} active reminders.` };
    }

    const now = Date.now();
    const dueAt = now + ms;
    const randomSuffix = crypto.randomUUID().slice(0, 8);

    const reminder: Reminder = {
      userId,
      guildId,
      channelId,
      message,
      dueAt,
      createdAt: now,
    };

    await kv.set(`reminder:${userId}:${guildId}:${now}-${randomSuffix}`, reminder, dueAt);

    const unixSeconds = Math.floor(dueAt / 1000);
    return { success: true, message: `Reminder set! I'll remind you <t:${unixSeconds}:R>.` };
  },
});
