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

/** Status codes that indicate the target is permanently unreachable. */
const PERMANENT_FAILURE_CODES = [403, 404];

async function deliverBatch(
  batch: Array<{ key: string; value: unknown }>,
): Promise<void> {
  await Promise.allSettled(
    batch.map(async (entry) => {
      const msg = entry.value as ScheduledMessage;
      try {
        const result = await discordBotFetch("POST", `channels/${msg.channelId}/messages`, {
          content: msg.content,
        });
        if (result.ok) {
          await kv.delete(entry.key);
        } else if (result.status && PERMANENT_FAILURE_CODES.includes(result.status)) {
          console.warn(`Scheduled message ${entry.key} deleted: channel inaccessible (${result.status})`);
          await kv.delete(entry.key);
        } else {
          console.error(`Failed to send scheduled message ${entry.key}: ${result.error}`);
        }
      } catch (err) {
        console.error(`Failed to send scheduled message ${entry.key}:`, err);
      }
    }),
  );
}

export default async function () {
  const due = await kv.listDue(Date.now(), KV_PREFIX);

  for (let i = 0; i < due.length; i += CONCURRENCY) {
    await deliverBatch(due.slice(i, i + CONCURRENCY));
  }
}
