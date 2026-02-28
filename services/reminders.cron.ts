/**
 * services/reminders.cron.ts
 *
 * Cron job that delivers due reminders and cleans up KV.
 * Schedule in Val Town to run every 1-5 minutes.
 */

import { kv } from "../discord/persistence/kv.ts";
import { discordBotFetch } from "../discord/discord-api.ts";
import type { Reminder } from "../discord/interactions/commands/remind.ts";

export default async function () {
  const entries = await kv.list("reminder:");
  const now = Date.now();

  for (const entry of entries) {
    const reminder = entry.value as Reminder;
    if (reminder.dueAt > now) continue;

    try {
      await discordBotFetch("POST", `channels/${reminder.channelId}/messages`, {
        content: `\u23F0 <@${reminder.userId}>, reminder: ${reminder.message}`,
      });
      await kv.delete(entry.key);
    } catch (err) {
      console.error(`Failed to deliver reminder ${entry.key}:`, err);
    }
  }
}
