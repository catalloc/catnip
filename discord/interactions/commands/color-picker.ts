/**
 * Color Picker Command - Demonstrates select menu components
 *
 * File: discord/interactions/commands/color-picker.ts
 */

import { defineCommand } from "../define-command.ts";

export default defineCommand({
  name: "color-picker",
  description: "Pick a color from a dropdown menu",

  registration: { type: "guild", servers: ["MAIN"] },
  deferred: false,
  ephemeral: false,

  async execute() {
    return {
      success: true,
      message: "Choose a color:",
      components: [
        {
          type: 1, // Action Row
          components: [
            {
              type: 3, // String Select
              custom_id: "color-select",
              placeholder: "Select a color...",
              options: [
                { label: "Red", value: "red", emoji: { name: "\uD83D\uDD34" } },
                { label: "Green", value: "green", emoji: { name: "\uD83D\uDFE2" } },
                { label: "Blue", value: "blue", emoji: { name: "\uD83D\uDD35" } },
                { label: "Yellow", value: "yellow", emoji: { name: "\uD83D\uDFE1" } },
              ],
            },
          ],
        },
      ],
    };
  },
});
