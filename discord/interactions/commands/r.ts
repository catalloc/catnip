/**
 * Dice Roll Command - Roll dice using standard TTRPG notation
 *
 * File: discord/interactions/commands/r.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";

const DICE_PATTERN = /^(\d+)d(\d+)([+-]\d+)?$/i;
const MAX_DICE = 20;
const MAX_SIDES = 100;
const MIN_SIDES = 2;

export default defineCommand({
  name: "r",
  description: "Roll dice (e.g. 2d20+5, 4d6, 1d100-2)",

  options: [
    {
      name: "dice",
      description: "Dice notation like 2d20+5, 4d6, 1d100-2",
      type: OptionTypes.STRING,
      required: true,
    },
  ],

  registration: {
    type: "guild",
    servers: ["MAIN"],
  },

  deferred: false,
  ephemeral: false,

  async execute({ options }) {
    const input = (options.dice as string).trim();
    const match = input.match(DICE_PATTERN);

    if (!match) {
      return {
        success: false,
        error: `Invalid dice notation \`${input}\`. Use format like \`2d20+5\`, \`4d6\`, \`1d100\`.`,
      };
    }

    const count = parseInt(match[1], 10);
    const sides = parseInt(match[2], 10);
    const modifier = match[3] ? parseInt(match[3], 10) : 0;

    if (count < 1 || count > MAX_DICE) {
      return { success: false, error: `Dice count must be between 1 and ${MAX_DICE}.` };
    }
    if (sides < MIN_SIDES || sides > MAX_SIDES) {
      return { success: false, error: `Die size must be between d${MIN_SIDES} and d${MAX_SIDES}.` };
    }

    const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
    const sum = rolls.reduce((a, b) => a + b, 0);
    const total = sum + modifier;

    const notation = `${count}d${sides}${modifier > 0 ? `+${modifier}` : modifier < 0 ? `${modifier}` : ""}`;

    let message: string;
    if (count === 1 && modifier === 0) {
      message = `\u{1F3B2} **${notation}**\nResult: **${total}**`;
    } else if (modifier === 0) {
      message = `\u{1F3B2} **${notation}**\nRolls: \`[${rolls.join(", ")}]\`\nTotal: **${total}**`;
    } else {
      message = `\u{1F3B2} **${notation}**\nRolls: \`[${rolls.join(", ")}]\`\nTotal: **${total}** (${sum} ${modifier > 0 ? "+" : "\u2212"} ${Math.abs(modifier)})`;
    }

    return { success: true, message };
  },
});
