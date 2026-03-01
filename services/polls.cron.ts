/**
 * services/polls.cron.ts
 *
 * Cron job that checks for expired polls and ends them.
 * Schedule in Val Town to run every 1-5 minutes.
 */

import { kv } from "../discord/persistence/kv.ts";
import { type PollConfig, endPoll } from "../discord/interactions/commands/poll.ts";

const MAX_DUE_PER_RUN = 100;
const ITEM_TIMEOUT_MS = 30_000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: number;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Timed out")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export default async function () {
  const entries = await kv.listDue(Date.now(), "poll:", MAX_DUE_PER_RUN);

  await Promise.allSettled(entries.map(async (entry) => {
    const config = entry.value as PollConfig;

    if (config.ended) {
      try {
        await kv.claimDelete(entry.key);
      } catch (err) {
        console.error(`Failed to clean up ended poll ${entry.key}:`, err);
      }
      return;
    }

    try {
      const guildId = entry.key.replace("poll:", "");
      await withTimeout(endPoll(guildId, config), ITEM_TIMEOUT_MS);
    } catch (err) {
      console.error(`Failed to end poll ${entry.key}:`, err);
    }
  }));
}
