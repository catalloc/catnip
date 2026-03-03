/**
 * services/polls.cron.ts
 *
 * Cron job that checks for expired polls and ends them.
 * Schedule in Val Town to run every 1-5 minutes.
 */

import { kv } from "../discord/persistence/kv.ts";
import { type PollConfig, endPoll } from "../discord/interactions/commands/poll.ts";
import { createLogger, finalizeAllLoggers } from "../discord/webhook/logger.ts";

const logger = createLogger("PollCron");

const MAX_DUE_PER_RUN = 100;
const ITEM_TIMEOUT_MS = 30_000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer = 0;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Timed out")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export default async function () {
  try {
    const entries = await kv.listDue(Date.now(), "poll:", MAX_DUE_PER_RUN);
    let ended = 0, cleaned = 0, failed = 0;

    await Promise.allSettled(entries.map(async (entry) => {
      const config = entry.value as PollConfig;
      if (!config?.channelId || !config?.messageId) {
        logger.warn(`Skipping malformed poll: ${entry.key}`);
        return;
      }

      // Ended polls past their cleanup delay — delete the KV row
      if (config.ended) {
        try {
          const deleted = await kv.claimDelete(entry.key);
          if (deleted) cleaned++;
        } catch (err) {
          failed++;
          logger.error(`Failed to clean up ended poll ${entry.key}:`, err);
        }
        return;
      }

      // Active poll whose due_at has arrived — endPoll handles atomicity
      try {
        const guildId = entry.key.slice("poll:".length);
        await withTimeout(endPoll(guildId), ITEM_TIMEOUT_MS);
        ended++;
      } catch (err) {
        failed++;
        logger.error(`Failed to end poll ${entry.key}:`, err);
      }
    }));

    if (entries.length > 0) {
      logger.info(`Run complete: ${entries.length} item(s) — ${ended} ended, ${cleaned} cleaned, ${failed} failed`);
    }
  } finally {
    await finalizeAllLoggers();
  }
}
