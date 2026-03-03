/**
 * Color Select Handler
 *
 * Handles the color-picker select menu interaction.
 * File: discord/interactions/components/color-select.ts
 */

import { defineComponent } from "../define-component.ts";

const COLOR_MAP: Record<string, { hex: number; label: string }> = {
  red: { hex: 0xed4245, label: "Red" },
  green: { hex: 0x57f287, label: "Green" },
  blue: { hex: 0x5865f2, label: "Blue" },
  yellow: { hex: 0xfee75c, label: "Yellow" },
};

export default defineComponent({
  customId: "color-select",
  match: "exact",
  type: "select",

  async execute({ values }) {
    const choice = values?.[0] ?? "red";
    const color = COLOR_MAP[choice] ?? COLOR_MAP.red;

    return {
      success: true,
      updateMessage: true,
      message: "",
      embed: {
        title: `You picked ${color.label}!`,
        color: color.hex,
        description: `Color hex: \`#${color.hex.toString(16).padStart(6, "0")}\``,
      },
    };
  },
});
