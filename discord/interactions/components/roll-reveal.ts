/**
 * Roll Reveal Button Handler
 *
 * Allows the roller to publicly reveal a secret dice roll.
 * File: discord/interactions/components/roll-reveal.ts
 */

import { defineComponent } from "../define-component.ts";
import { discordBotFetch } from "../../discord-api.ts";

const SECRET_PREFIX = "\u{1F510} **Secret Roll**\n";

export default defineComponent({
  customId: "roll-reveal:",
  match: "prefix",
  type: "button",

  async execute({ customId, userId, interaction }) {
    const rollerId = customId.split(":")[1];
    if (userId !== rollerId) {
      return { success: false, error: "Only the roller can reveal this roll." };
    }

    const rawContent: string = interaction.message?.content ?? "";
    const revealContent = rawContent.startsWith(SECRET_PREFIX)
      ? rawContent.slice(SECRET_PREFIX.length)
      : rawContent;

    const channelId: string = interaction.channel_id ?? interaction.channel?.id;
    if (channelId) {
      await discordBotFetch("POST", `channels/${channelId}/messages`, {
        content: revealContent,
      });
    }

    return {
      success: true,
      updateMessage: true,
      message: rawContent.startsWith(SECRET_PREFIX)
        ? rawContent.slice(SECRET_PREFIX.length)
        : rawContent,
    };
  },
});
