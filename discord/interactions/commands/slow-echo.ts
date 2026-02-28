/**
 * Slow Echo Command - Demonstrates deferred response path with cooldown
 *
 * File: discord/interactions/commands/slow-echo.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";

export default defineCommand({
  name: "slow-echo",
  description: "Echo a message after a delay (deferred example)",

  options: [
    {
      name: "message",
      description: "The message to echo back",
      type: OptionTypes.STRING,
      required: true,
      min_length: 1,
    },
    {
      name: "delay",
      description: "Delay in seconds (1-10)",
      type: OptionTypes.INTEGER,
      required: false,
    },
  ],

  registration: {
    type: "guild",
    servers: ["MAIN"],
  },

  deferred: true,
  ephemeral: false,
  cooldown: 10,

  async execute({ options }) {
    const message = options?.message as string;
    const delay = Math.min(10, Math.max(1, (options?.delay as number) || 3));

    await new Promise((r) => setTimeout(r, delay * 1000));

    return {
      success: true,
      message: `> ${message}\n\n_(delayed ${delay}s)_`,
    };
  },
});
