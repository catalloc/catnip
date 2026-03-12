/**
 * services/scheduled-messages.cron.ts
 *
 * Cron job that delivers due scheduled messages and cleans up KV.
 * Schedule in Val Town to run every 1-5 minutes.
 */

import { discordBotFetch } from "../discord/discord-api.ts";
import type { ScheduledMessage } from "../discord/interactions/commands/schedule.ts";
import { KV_PREFIX } from "../discord/interactions/commands/schedule.ts";
import { runCron, deliverWithRetry } from "../discord/helpers/cron.ts";

const CONCURRENCY = 5;

export default async function () {
  await runCron({
    name: "ScheduledMsgCron",
    mutePath: "cron:scheduled-messages",
    prefix: KV_PREFIX,
    maxDue: 100,
    async process(entry, logger) {
      await deliverWithRetry({
        entry,
        validate: (v) => !!(v as ScheduledMessage)?.channelId && !!(v as ScheduledMessage)?.content,
        deliver: (v) => {
          const msg = v as ScheduledMessage;
          return discordBotFetch("POST", `channels/${msg.channelId}/messages`, {
            content: msg.content,
          });
        },
        logger,
        entityLabel: "scheduled message",
      });
    },
  });
}
