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

      // Atomically claim this reminder — if another cron run already claimed it, skip
      const claimed = await kv.claimDelete(entry.key);
      if (!claimed) return;

      try {
        const result = await discordBotFetch("POST", `channels/${reminder.channelId}/messages`, {
          content: `\u23F0 <@${reminder.userId}>, reminder: ${reminder.message}`,
        });
        if (result.ok) {
          // Already deleted by claimDelete — nothing to do
        } else if (result.status && PERMANENT_FAILURE_CODES.includes(result.status)) {
          console.warn(`Reminder ${entry.key} dropped: channel inaccessible (${result.status})`);
        } else {
          console.error(`Failed to deliver reminder ${entry.key}: ${result.error}`);
          // Transient failure — re-insert so it's retried next cron run
          await kv.set(entry.key, reminder, Date.now());
        }
      } catch (err) {
        console.error(`Failed to deliver reminder ${entry.key}:`, err);
        // Transient failure — re-insert so it's retried next cron run
        await kv.set(entry.key, reminder, Date.now());
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
