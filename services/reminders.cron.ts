/**
 * services/reminders.cron.ts
 *
 * Cron job that delivers due reminders and cleans up KV.
 * Schedule in Val Town to run every 1-5 minutes.
 */

import { discordBotFetch } from "../discord/discord-api.ts";
import type { Reminder } from "../discord/interactions/commands/remind.ts";
import { runCron, deliverWithRetry } from "../discord/helpers/cron.ts";

const CONCURRENCY = 5;

export default async function () {
  await runCron({
    name: "ReminderCron",
    prefix: "reminder:",
    maxDue: 100,
    async process(entry, logger) {
      const reminder = entry.value as Reminder;

      await deliverWithRetry({
        entry,
        validate: (v) => !!(v as Reminder)?.channelId && !!(v as Reminder)?.userId && !!(v as Reminder)?.message,
        deliver: (v) => {
          const r = v as Reminder;
          return discordBotFetch("POST", `channels/${r.channelId}/messages`, {
            content: `\u23F0 <@${r.userId}>, reminder: ${r.message}`,
          });
        },
        logger,
        entityLabel: "reminder",
      });
    },
  });
}
