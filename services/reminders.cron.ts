/**
 * services/reminders.cron.ts
 *
 * Cron job that delivers due reminders and cleans up KV.
 * Schedule in Val Town to run every 1-5 minutes.
 */

import { kv } from "../discord/persistence/kv.ts";
import { discordBotFetch } from "../discord/discord-api.ts";
import type { Reminder } from "../discord/interactions/commands/remind.ts";

const CONCURRENCY = 5;

async function deliverBatch(
  batch: Array<{ key: string; value: unknown }>,
): Promise<void> {
  await Promise.allSettled(
    batch.map(async (entry) => {
      const reminder = entry.value as Reminder;
      try {
        await discordBotFetch("POST", `channels/${reminder.channelId}/messages`, {
          content: `\u23F0 <@${reminder.userId}>, reminder: ${reminder.message}`,
        });
        await kv.delete(entry.key);
      } catch (err) {
        console.error(`Failed to deliver reminder ${entry.key}:`, err);
      }
    }),
  );
}

export default async function () {
  const due = await kv.listDue(Date.now(), "reminder:");

  for (let i = 0; i < due.length; i += CONCURRENCY) {
    await deliverBatch(due.slice(i, i + CONCURRENCY));
  }
}
