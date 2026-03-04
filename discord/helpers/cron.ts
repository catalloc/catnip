/**
 * discord/helpers/cron.ts
 *
 * Shared cron job lifecycle and delivery-with-retry helpers.
 * Reduces boilerplate in reminders, scheduled-messages, giveaways, polls, tickets cron files.
 */

import { kv } from "../persistence/kv.ts";
import { createLogger, finalizeAllLoggers, type DiscordLogger } from "../webhook/logger.ts";

export interface CronOpts {
  name: string;
  prefix: string;
  maxDue?: number;
  process: (entry: { key: string; value: unknown }, logger: DiscordLogger) => Promise<void>;
}

/**
 * Standard cron lifecycle: create logger, list due items, process in parallel, finalize.
 */
export async function runCron(opts: CronOpts): Promise<void> {
  const logger = createLogger(opts.name);
  const start = Date.now();
  try {
    const entries = await kv.listDue(Date.now(), opts.prefix, opts.maxDue ?? 100);

    await Promise.allSettled(
      entries.map((entry) => opts.process(entry, logger)),
    );

    if (entries.length > 0) {
      const maxDue = opts.maxDue ?? 100;
      logger.info(`Run complete: ${entries.length} item(s) processed in ${Date.now() - start}ms`);
      if (entries.length >= maxDue) {
        logger.warn(`Processed ${maxDue} items (max) — more may be pending for next run`);
      }
    }
  } catch (err) {
    logger.error("Cron run failed:", err);
  } finally {
    await finalizeAllLoggers();
  }
}

export interface DeliverWithRetryOpts {
  entry: { key: string; value: unknown };
  deliver: (value: any) => Promise<{ ok: boolean; status?: number; error?: string }>;
  validate?: (value: any) => boolean;
  logger: DiscordLogger;
  entityLabel: string;
  maxRetries?: number;
  backoffBaseMs?: number;
  permanentFailureCodes?: number[];
}

/**
 * Claim-delete + delivery + backoff retry pattern for cron jobs.
 * Used by reminders and scheduled-messages cron.
 */
export async function deliverWithRetry(opts: DeliverWithRetryOpts): Promise<void> {
  const {
    entry, deliver, validate, logger, entityLabel,
    maxRetries = 5,
    backoffBaseMs = 60_000,
    permanentFailureCodes = [403, 404],
  } = opts;

  const value = entry.value as Record<string, unknown>;

  if (validate && !validate(value)) {
    logger.warn(`Deleting malformed ${entityLabel}: ${entry.key}`);
    await kv.claimDelete(entry.key).catch(() => {});
    return;
  }

  let claimed: boolean;
  try {
    claimed = await kv.claimDelete(entry.key);
  } catch (err) {
    logger.error(`Failed to claim ${entityLabel} ${entry.key}: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  if (!claimed) return;

  try {
    const result = await deliver(value);
    if (result.ok) {
      // Delivered successfully — already deleted by claimDelete
    } else if (result.status && permanentFailureCodes.includes(result.status)) {
      logger.warn(`${capitalize(entityLabel)} ${entry.key} dropped: channel inaccessible (${result.status})`);
    } else {
      await reinsertWithBackoff(entry, value, logger, entityLabel, maxRetries, backoffBaseMs);
    }
  } catch (err) {
    logger.error(`Failed to deliver ${entityLabel} ${entry.key}:`, err);
    await reinsertWithBackoff(entry, value, logger, entityLabel, maxRetries, backoffBaseMs);
  }
}

async function reinsertWithBackoff(
  entry: { key: string },
  value: Record<string, unknown>,
  logger: DiscordLogger,
  entityLabel: string,
  maxRetries: number,
  backoffBaseMs: number,
): Promise<void> {
  const retryCount = ((value.retryCount as number) ?? 0) + 1;
  if (retryCount < maxRetries) {
    await kv.set(entry.key, { ...value, retryCount }, Date.now() + backoffBaseMs * Math.pow(2, retryCount - 1));
  } else {
    logger.warn(`${capitalize(entityLabel)} ${entry.key} dropped after ${maxRetries} retries`);
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
