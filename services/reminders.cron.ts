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
const MAX_RETRIES = 5;
const MAX_DUE_PER_RUN = 100;

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
          const retryCount = (reminder.retryCount ?? 0) + 1;
          if (retryCount < MAX_RETRIES) {
            await kv.set(entry.key, { ...reminder, retryCount }, Date.now());
          } else {
            console.warn(`Reminder ${entry.key} dropped after ${MAX_RETRIES} retries`);
          }
        }
      } catch (err) {
        console.error(`Failed to deliver reminder ${entry.key}:`, err);
        const retryCount = (reminder.retryCount ?? 0) + 1;
        if (retryCount < MAX_RETRIES) {
          await kv.set(entry.key, { ...reminder, retryCount }, Date.now());
        } else {
          console.warn(`Reminder ${entry.key} dropped after ${MAX_RETRIES} retries`);
        }
      }
    }),
  );
}

export default async function () {
  const due = await kv.listDue(Date.now(), "reminder:", MAX_DUE_PER_RUN);

  for (let i = 0; i < due.length; i += CONCURRENCY) {
    await deliverBatch(due.slice(i, i + CONCURRENCY));
  }
}
