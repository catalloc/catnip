/**
 * Poll Vote Button Handler
 *
 * Handles button clicks on poll panels.
 * Toggles votes: click to vote, click same to remove, click different to switch.
 * Panel embed is updated at most once every PANEL_UPDATE_INTERVAL_MS
 * to avoid rate-limiting under heavy traffic.
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

const PANEL_UPDATE_INTERVAL_MS = 5_000;
const MAX_VOTERS = 10_000;

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

    // Check voter cap (only for new votes)
    const voterCount = Object.keys(existing.votes).length;
    if (voterCount >= MAX_VOTERS && existing.votes[userId] === undefined) {
      return { success: false, error: "This poll has reached the maximum number of voters." };
    }

    let action: "removed" | "switched" | "voted" = "voted";
    let shouldUpdatePanel = false;
    const now = Date.now();

    const updated = await kv.update<PollConfig>(pollKey(guildId), (config) => {
      if (!config || config.ended) return config!;
      if (config.votes[userId] === optionIndex) {
        delete config.votes[userId];
        action = "removed";
      } else {
        // Enforce cap inside atomic update for new voters
        if (config.votes[userId] === undefined && Object.keys(config.votes).length >= MAX_VOTERS) {
          return config;
        }
        action = config.votes[userId] !== undefined ? "switched" : "voted";
        config.votes[userId] = optionIndex;
      }
      // Throttle panel updates
      const lastUpdate = (config as any).lastPanelUpdate ?? 0;
      if (now - lastUpdate >= PANEL_UPDATE_INTERVAL_MS) {
        (config as any).lastPanelUpdate = now;
        shouldUpdatePanel = true;
      }
      return config;
    });

    if (!updated || updated.ended) {
      return { success: false, error: "This poll has ended." };
    }

    // Update panel (throttled)
    if (shouldUpdatePanel) {
      await discordBotFetch("PATCH", `channels/${updated.channelId}/messages/${updated.messageId}`, {
        embeds: [buildPollEmbed(updated)],
        components: buildPollComponents(guildId, updated.options),
      });
    }

    const optionName = updated.options[optionIndex];
    const messages = {
      removed: `Vote for **${optionName}** removed.`,
      switched: `Vote changed to **${optionName}**.`,
      voted: `Voted for **${optionName}**.`,
    };
    return { success: true, message: messages[action] };
  },
});
