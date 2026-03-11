/**
 * services/example.cron.ts
 *
 * Example cron job demonstrating webhook messaging from a scheduled task.
 * Schedule this in Val Town's cron configuration to run periodically.
 */

import { send } from "../discord/webhook/send.ts";
import { embed } from "../discord/helpers/embed-builder.ts";

export default async function () {
  await send(
    embed().info("Cron job executed successfully.").timestamp().build(),
  );
}
