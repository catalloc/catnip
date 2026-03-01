/**
 * Poll Vote Button Handler
 *
 * Handles button clicks on poll panels.
 * Toggles votes: click to vote, click same to remove, click different to switch.
 *
 * File: discord/interactions/components/poll-vote.ts
 */

import { defineComponent } from "../define-component.ts";
import { kv } from "../../persistence/kv.ts";
import { discordBotFetch } from "../../discord-api.ts";
import {
  type PollConfig,
  pollKey,
  buildPollEmbed,
  buildPollComponents,
} from "../commands/poll.ts";

export default defineComponent({
  customId: "poll-vote:",
  match: "prefix",
  type: "button",

  async execute({ customId, guildId, userId }) {
    // Parse: poll-vote:guildId:optionIndex
    const parts = customId.split(":");
    if (parts.length < 3) {
      return { success: false, error: "Invalid vote button." };
    }
    const optionIndex = parseInt(parts[2], 10);
    if (isNaN(optionIndex) || optionIndex < 0) {
      return { success: false, error: "Invalid option." };
    }

    // Pre-flight check before atomic update
    const existing = await kv.get<PollConfig>(pollKey(guildId));
    if (!existing || existing.ended) {
      return { success: false, error: "This poll has ended." };
    }
    if (optionIndex >= existing.options.length) {
      return { success: false, error: "Invalid option." };
    }

    let action: "removed" | "switched" | "voted" = "voted";

    const updated = await kv.update<PollConfig>(pollKey(guildId), (config) => {
      if (!config || config.ended) return config!;
      if (config.votes[userId] === optionIndex) {
        delete config.votes[userId];
        action = "removed";
      } else {
        action = config.votes[userId] !== undefined ? "switched" : "voted";
        config.votes[userId] = optionIndex;
      }
      return config;
    });

    if (!updated || updated.ended) {
      return { success: false, error: "This poll has ended." };
    }

    // Update panel
    await discordBotFetch("PATCH", `channels/${updated.channelId}/messages/${updated.messageId}`, {
      embeds: [buildPollEmbed(updated)],
      components: buildPollComponents(guildId, updated.options),
    });

    const optionName = updated.options[optionIndex];
    const messages = {
      removed: `Vote for **${optionName}** removed.`,
      switched: `Vote changed to **${optionName}**.`,
      voted: `Voted for **${optionName}**.`,
    };
    return { success: true, message: messages[action] };
  },
});
