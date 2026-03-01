/**
 * services/scheduled-messages.cron.ts
 *
 * Cron job that delivers due scheduled messages and cleans up KV.
 * Schedule in Val Town to run every 1-5 minutes.
 */

import { kv } from "../discord/persistence/kv.ts";
import { discordBotFetch } from "../discord/discord-api.ts";
import type { ScheduledMessage } from "../discord/interactions/commands/schedule.ts";
import { KV_PREFIX } from "../discord/interactions/commands/schedule.ts";

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
      const msg = entry.value as ScheduledMessage;

      // Atomically claim this message — if another cron run already claimed it, skip
      const claimed = await kv.claimDelete(entry.key);
      if (!claimed) return;

      try {
        const result = await discordBotFetch("POST", `channels/${msg.channelId}/messages`, {
          content: msg.content,
        });
        if (result.ok) {
          // Already deleted by claimDelete — nothing to do
        } else if (result.status && PERMANENT_FAILURE_CODES.includes(result.status)) {
          console.warn(`Scheduled message ${entry.key} dropped: channel inaccessible (${result.status})`);
        } else {
          console.error(`Failed to send scheduled message ${entry.key}: ${result.error}`);
          const retryCount = (msg.retryCount ?? 0) + 1;
          if (retryCount < MAX_RETRIES) {
            await kv.set(entry.key, { ...msg, retryCount }, Date.now());
          } else {
            console.warn(`Scheduled message ${entry.key} dropped after ${MAX_RETRIES} retries`);
          }
        }
      } catch (err) {
        console.error(`Failed to send scheduled message ${entry.key}:`, err);
        const retryCount = (msg.retryCount ?? 0) + 1;
        if (retryCount < MAX_RETRIES) {
          await kv.set(entry.key, { ...msg, retryCount }, Date.now());
        } else {
          console.warn(`Scheduled message ${entry.key} dropped after ${MAX_RETRIES} retries`);
        }
      }
    }),
  );
}

export default async function () {
  const due = await kv.listDue(Date.now(), KV_PREFIX, MAX_DUE_PER_RUN);

  for (let i = 0; i < due.length; i += CONCURRENCY) {
    await deliverBatch(due.slice(i, i + CONCURRENCY));
  }
}
