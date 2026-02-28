/**
 * Pick Command - Pick a random item from a comma-separated list
 *
 * File: discord/interactions/commands/pick.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";

export default defineCommand({
  name: "pick",
  description: "Pick a random item from a comma-separated list",

  options: [
    {
      name: "choices",
      description: "Comma-separated list of choices",
      type: OptionTypes.STRING,
      required: true,
      min_length: 1,
    },
  ],

  registration: { type: "guild", servers: ["MAIN"] },
  deferred: false,
  ephemeral: false,

  async execute({ options }) {
    const raw = (options.choices as string).split(",").map((s) => s.trim()).filter(Boolean);
    if (raw.length < 2) {
      return { success: false, error: "Provide at least 2 comma-separated choices." };
    }
    const pick = raw[Math.floor(Math.random() * raw.length)];
    return { success: true, message: `I picked: **${pick}**` };
  },
});
