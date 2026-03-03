/**
 * Echo Command - Repeats user input back
 *
 * File: discord/interactions/commands/echo.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";

/** Strip @everyone, @here, and role/user mentions to prevent abuse */
function sanitizeMentions(text: string): string {
  return text
    .replace(/@(everyone|here)/gi, "@\u200B$1")
    .replace(/<@[&!]?\d+>/g, "[mention removed]");
}

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
    const message = sanitizeMentions(options?.message ?? "");
    return { success: true, message: `> ${message}` };
  },
});
