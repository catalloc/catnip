/**
 * Ping Command - Simple health check
 *
 * File: discord/interactions/commands/ping.ts
 */

import { defineCommand } from "../define-command.ts";

export default defineCommand({
  name: "ping",
  description: "Check if the bot is responsive",

  registration: {
    type: "guild",
    servers: ["MAIN"],
  },

  deferred: false,

  async execute() {
    return { success: true, message: "Pong!" };
  },
});
