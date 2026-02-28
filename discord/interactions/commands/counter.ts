/**
 * Counter Command - Persistent counter using KV store
 *
 * File: discord/interactions/commands/counter.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { kv } from "../../persistence/kv.ts";

const KV_KEY = "counter:global";

export default defineCommand({
  name: "counter",
  description: "Increment or reset a persistent counter",

  options: [
    {
      name: "action",
      description: "increment (default) or reset",
      type: OptionTypes.STRING,
      required: false,
    },
  ],

  registration: { type: "guild", servers: ["MAIN"] },
  deferred: false,
  ephemeral: false,

  async execute({ options }) {
    const action = (options.action as string | undefined)?.toLowerCase();

    if (action === "reset") {
      await kv.set(KV_KEY, 0);
      return { success: true, message: "Counter reset to **0**." };
    }

    const next = await kv.update<number>(KV_KEY, (current) => (current ?? 0) + 1);
    return { success: true, message: `Counter: **${next}**` };
  },
});
