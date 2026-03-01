/**
 * Coin Flip Command - Flip a coin
 *
 * File: discord/interactions/commands/coin-flip.ts
 */

import { defineCommand } from "../define-command.ts";

export default defineCommand({
  name: "coin-flip",
  description: "Flip a coin",

  registration: { type: "guild" },

  deferred: false,
  ephemeral: false,

  async execute() {
    const result = Math.random() < 0.5 ? "Heads" : "Tails";
    return { success: true, message: `The coin landed on **${result}**!` };
  },
});
