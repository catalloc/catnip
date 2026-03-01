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

/** Status codes that indicate the target is permanently unreachable. */
const PERMANENT_FAILURE_CODES = [403, 404];

async function deliverBatch(
  batch: Array<{ key: string; value: unknown }>,
): Promise<void> {
  await Promise.allSettled(
    batch.map(async (entry) => {
      const reminder = entry.value as Reminder;
      try {
        const result = await discordBotFetch("POST", `channels/${reminder.channelId}/messages`, {
          content: `\u23F0 <@${reminder.userId}>, reminder: ${reminder.message}`,
        });
        if (result.ok) {
          await kv.delete(entry.key);
        } else if (result.status && PERMANENT_FAILURE_CODES.includes(result.status)) {
          console.warn(`Reminder ${entry.key} deleted: channel inaccessible (${result.status})`);
          await kv.delete(entry.key);
        } else {
          console.error(`Failed to deliver reminder ${entry.key}: ${result.error}`);
        }
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
