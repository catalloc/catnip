/**
 * Example Button Handler
 *
 * Demonstrates a basic button component interaction.
 * File: discord/interactions/components/example-button.ts
 */

import { defineComponent } from "../define-component.ts";
import { EmbedColors } from "../../constants.ts";

export default defineComponent({
  customId: "example-button",
  match: "exact",
  type: "button",

  async execute({ userId }) {
    return {
      success: true,
      message: `Button clicked by <@${userId}>!`,
      embed: {
        title: "Button Interaction",
        description: "This is an example button response.",
        color: EmbedColors.SUCCESS,
      },
    };
  },
});
