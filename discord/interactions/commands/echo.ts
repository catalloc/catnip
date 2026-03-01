/**
 * Echo Command - Repeats user input back
 *
 * File: discord/interactions/commands/echo.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";

export default defineCommand({
  name: "echo",
  description: "Repeat a message back to you",

  options: [
    {
      name: "message",
      description: "The message to echo",
      type: OptionTypes.STRING,
      required: true,
      min_length: 1,
    },
  ],

  registration: { type: "guild" },

  deferred: false,
  ephemeral: false,

  async execute({ options }) {
    const message = options?.message ?? "";
    return { success: true, message: `> ${message}` };
  },
});
