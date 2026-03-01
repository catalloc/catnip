/**
 * services/giveaways.cron.ts
 *
 * Cron job that checks for expired giveaways and ends them.
 * Schedule in Val Town to run every 1-5 minutes.
 */

import { kv } from "../discord/persistence/kv.ts";
import { type GiveawayConfig, endGiveaway } from "../discord/interactions/commands/giveaway.ts";

export default async function () {
  const entries = await kv.listDue(Date.now(), "giveaway:");

  for (const entry of entries) {
    const config = entry.value as GiveawayConfig;

    if (config.ended) {
      // Past the 24h grace period — clean up dead data
      try {
        await kv.delete(entry.key);
      } catch (err) {
        console.error(`Failed to clean up ended giveaway ${entry.key}:`, err);
      }
      continue;
    }

    try {
      const guildId = entry.key.replace("giveaway:", "");
      await endGiveaway(guildId, config);
    } catch (err) {
      console.error(`Failed to end giveaway ${entry.key}:`, err);
    }
  }
}
