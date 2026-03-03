/**
 * services/giveaways.cron.ts
 *
 * Cron job that checks for expired giveaways and ends them.
 * Schedule in Val Town to run every 1-5 minutes.
 */

import { kv } from "../discord/persistence/kv.ts";
import { type GiveawayConfig, endGiveaway } from "../discord/interactions/commands/giveaway.ts";
import { createLogger, finalizeAllLoggers } from "../discord/webhook/logger.ts";
import { withTimeout } from "../discord/helpers/timeout.ts";

const logger = createLogger("GiveawayCron");

const MAX_DUE_PER_RUN = 100;
const ITEM_TIMEOUT_MS = 30_000;

export default async function () {
  try {
    const entries = await kv.listDue(Date.now(), "giveaway:", MAX_DUE_PER_RUN);
    let ended = 0, cleaned = 0, failed = 0;

    await Promise.allSettled(entries.map(async (entry) => {
      const config = entry.value as GiveawayConfig;
      if (!config?.channelId || !config?.messageId) {
        logger.warn(`Skipping malformed giveaway: ${entry.key}`);
        return;
      }

      // Ended giveaways past their cleanup delay — delete the KV row
      if (config.ended) {
        try {
          const deleted = await kv.claimDelete(entry.key);
          if (deleted) cleaned++;
        } catch (err) {
          failed++;
          logger.error(`Failed to clean up ended giveaway ${entry.key}:`, err);
        }
        return;
      }

      // Active giveaway whose due_at has arrived — endGiveaway handles atomicity
      try {
        const guildId = entry.key.slice("giveaway:".length);
        await withTimeout(endGiveaway(guildId), ITEM_TIMEOUT_MS);
        ended++;
      } catch (err) {
        failed++;
        const isTimeout = err instanceof Error && err.message === "Timed out";
        if (isTimeout) {
          logger.warn(`Timed out ending giveaway ${entry.key} — will retry next run`);
        } else {
          logger.error(`Failed to end giveaway ${entry.key}:`, err);
        }
      }
    }));

    if (entries.length > 0) {
      logger.info(`Run complete: ${entries.length} item(s) — ${ended} ended, ${cleaned} cleaned, ${failed} failed`);
    }
  } finally {
    await finalizeAllLoggers();
  }
}
