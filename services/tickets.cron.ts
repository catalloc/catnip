/**
 * services/tickets.cron.ts
 *
 * Cron job that deletes closed ticket channels after their 24h grace period.
 * Schedule in Val Town to run every 1-5 minutes.
 */

import { kv } from "../discord/persistence/kv.ts";
import { type TicketData, KV_PREFIX } from "../discord/interactions/commands/ticket.ts";
import { discordBotFetch } from "../discord/discord-api.ts";
import { createLogger, finalizeAllLoggers } from "../discord/webhook/logger.ts";
import { withTimeout } from "../discord/helpers/timeout.ts";

const logger = createLogger("TicketCron");

const MAX_DUE_PER_RUN = 50;
const ITEM_TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 60 * 60 * 1000; // 1 hour

export default async function () {
  try {
    const entries = await kv.listDue(Date.now(), KV_PREFIX, MAX_DUE_PER_RUN);
    let deleted = 0, failed = 0;

    await Promise.allSettled(entries.map(async (entry) => {
      const ticket = entry.value as TicketData;

      // Only process closed tickets
      if (ticket.status !== "closed") return;

      const claimed = await kv.claimDelete(entry.key);
      if (!claimed) return;

      try {
        const result = await withTimeout(
          discordBotFetch("DELETE", `channels/${ticket.channelId}`),
          ITEM_TIMEOUT_MS,
        );

        // Treat 404 as success (channel already deleted)
        if (result.ok || result.status === 404) {
          deleted++;
        } else {
          throw new Error(`HTTP ${result.status}: ${result.error}`);
        }
      } catch (err) {
        failed++;
        logger.error(`Failed to delete ticket channel ${ticket.channelId}:`, err);
        // Re-insert with retry delay
        try {
          await kv.set(entry.key, ticket, Date.now() + RETRY_DELAY_MS);
        } catch (reinsertErr) {
          logger.error(`Failed to re-insert ticket ${entry.key} for retry:`, reinsertErr);
        }
      }
    }));

    if (entries.length > 0) {
      logger.info(`Run complete: ${entries.length} item(s) — ${deleted} deleted, ${failed} failed`);
    }
  } finally {
    await finalizeAllLoggers();
  }
}
