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

export default async function () {
  const entries = await kv.list(KV_PREFIX);
  const now = Date.now();

  for (const entry of entries) {
    const msg = entry.value as ScheduledMessage;
    if (msg.sendAt > now) continue;

    try {
      await discordBotFetch("POST", `channels/${msg.channelId}/messages`, {
        content: msg.content,
      });
      await kv.delete(entry.key);
    } catch (err) {
      console.error(`Failed to send scheduled message ${entry.key}:`, err);
    }
  }
}
