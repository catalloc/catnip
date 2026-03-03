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
import { createLogger, finalizeAllLoggers } from "../discord/webhook/logger.ts";

const logger = createLogger("ScheduledMsgCron");

const CONCURRENCY = 5;
const MAX_RETRIES = 5;
const MAX_DUE_PER_RUN = 100;
const BACKOFF_BASE_MS = 60_000; // 1 min, 2 min, 4 min, 8 min

/** Status codes that indicate the target is permanently unreachable. */
const PERMANENT_FAILURE_CODES = [403, 404];

async function deliverBatch(
  batch: Array<{ key: string; value: unknown }>,
): Promise<void> {
  await Promise.allSettled(
    batch.map(async (entry) => {
      const msg = entry.value as ScheduledMessage;
      if (!msg?.channelId || !msg?.content) {
        logger.warn(`Skipping malformed scheduled message: ${entry.key}`);
        return;
      }

      // Atomically claim this message — if another cron run already claimed it, skip
      let claimed: boolean;
      try {
        claimed = await kv.claimDelete(entry.key);
      } catch (err) {
        logger.error(`Failed to claim scheduled message ${entry.key}: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
      if (!claimed) return;

      try {
        const result = await discordBotFetch("POST", `channels/${msg.channelId}/messages`, {
          content: msg.content,
        });
        if (result.ok) {
          // Already deleted by claimDelete — nothing to do
        } else if (result.status && PERMANENT_FAILURE_CODES.includes(result.status)) {
          logger.warn(`Scheduled message ${entry.key} dropped: channel inaccessible (${result.status})`);
        } else {
          logger.error(`Failed to send scheduled message ${entry.key}: ${result.error}`);
          const retryCount = (msg.retryCount ?? 0) + 1;
          if (retryCount < MAX_RETRIES) {
            await kv.set(entry.key, { ...msg, retryCount }, Date.now() + BACKOFF_BASE_MS * Math.pow(2, retryCount - 1));
          } else {
            logger.warn(`Scheduled message ${entry.key} dropped after ${MAX_RETRIES} retries`);
          }
        }
      } catch (err) {
        logger.error(`Failed to send scheduled message ${entry.key}:`, err);
        const retryCount = (msg.retryCount ?? 0) + 1;
        if (retryCount < MAX_RETRIES) {
          await kv.set(entry.key, { ...msg, retryCount }, Date.now() + BACKOFF_BASE_MS * Math.pow(2, retryCount - 1));
        } else {
          logger.warn(`Scheduled message ${entry.key} dropped after ${MAX_RETRIES} retries`);
        }
      }
    }),
  );
}

export default async function () {
  try {
    const due = await kv.listDue(Date.now(), KV_PREFIX, MAX_DUE_PER_RUN);

    for (let i = 0; i < due.length; i += CONCURRENCY) {
      await deliverBatch(due.slice(i, i + CONCURRENCY));
    }

    logger.info(`Run complete: ${due.length} scheduled message(s) processed`);
  } catch (err) {
    logger.error("Cron run failed:", err);
  } finally {
    await finalizeAllLoggers();
  }
}
