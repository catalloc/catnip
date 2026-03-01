/**
 * services/polls.cron.ts
 *
 * Cron job that checks for expired polls and ends them.
 * Schedule in Val Town to run every 1-5 minutes.
 */

import { kv } from "../discord/persistence/kv.ts";
import { type PollConfig, endPoll } from "../discord/interactions/commands/poll.ts";

export default async function () {
  const entries = await kv.listDue(Date.now(), "poll:");

  for (const entry of entries) {
    const config = entry.value as PollConfig;
    if (config.ended) continue;

    try {
      const guildId = entry.key.replace("poll:", "");
      await endPoll(guildId, config);
    } catch (err) {
      console.error(`Failed to end poll ${entry.key}:`, err);
    }
  }
}
