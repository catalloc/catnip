/**
 * services/polls.cron.ts
 *
 * Cron job that checks for expired polls and ends them.
 * Schedule in Val Town to run every 1-5 minutes.
 */

import { kv } from "../discord/persistence/kv.ts";
import { type PollConfig, endPoll, announcePoll, MAX_ANNOUNCE_RETRIES } from "../discord/interactions/commands/poll.ts";
import { withTimeout } from "../discord/helpers/timeout.ts";
import { runCron } from "../discord/helpers/cron.ts";

const ITEM_TIMEOUT_MS = 30_000;
const ANNOUNCE_RETRY_DELAY_MS = 15 * 60 * 1000;
const CLEANUP_DELAY_MS = 24 * 60 * 60 * 1000;

export default async function () {
  let ended = 0, cleaned = 0, retried = 0, failed = 0;

  await runCron({
    name: "PollCron",
    prefix: "poll:",
    maxDue: 100,
    async process(entry, logger) {
      const config = entry.value as PollConfig;
      if (!config?.channelId || !config?.messageId) {
        logger.warn(`Deleting malformed poll: ${entry.key}`);
        await kv.claimDelete(entry.key).catch((e) =>
          logger.warn(`Failed to delete malformed entry ${entry.key}: ${e instanceof Error ? e.message : String(e)}`)
        );
        return;
      }

      // Ended polls — retry announcement or clean up
      if (config.ended) {
        if (config.announceFailed) {
          const guildId = entry.key.slice("poll:".length);
          const retries = (config.announceRetries ?? 0) + 1;
          try {
            const success = await withTimeout(announcePoll(guildId, config), ITEM_TIMEOUT_MS);
            if (success) {
              const { announceFailed: _, announceRetries: __, ...clean } = config;
              await kv.set(entry.key, clean, Date.now() + CLEANUP_DELAY_MS);
              retried++;
            } else if (retries >= MAX_ANNOUNCE_RETRIES) {
              const { announceFailed: _, announceRetries: __, ...clean } = config;
              await kv.set(entry.key, clean, Date.now() + CLEANUP_DELAY_MS);
              logger.warn(`Giving up on poll announce for ${entry.key} after ${retries} retries`);
            } else {
              await kv.set(
                entry.key,
                { ...config, announceRetries: retries },
                Date.now() + ANNOUNCE_RETRY_DELAY_MS * Math.pow(2, retries - 1),
              );
            }
          } catch (err) {
            failed++;
            logger.error(`Failed to retry poll announce ${entry.key}:`, err);
          }
          return;
        }

        // Normal cleanup — delete the KV row
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
        const isTimeout = err instanceof Error && err.message === "Timed out";
        if (isTimeout) {
          logger.warn(`Timed out ending poll ${entry.key} — will retry next run`);
        } else {
          logger.error(`Failed to end poll ${entry.key}:`, err);
        }
      }
    },
  });
}
