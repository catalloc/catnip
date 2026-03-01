/**
 * Giveaway Enter Button Handler
 *
 * Handles button clicks on giveaway panels.
 * Adds users to the entrant list and updates the panel.
 * Panel embed is updated at most once every PANEL_UPDATE_INTERVAL_MS
 * to avoid rate-limiting under heavy traffic.
 *
 * File: discord/interactions/components/giveaway-enter.ts
 */

import { defineComponent } from "../define-component.ts";
import { kv } from "../../persistence/kv.ts";
import { discordBotFetch } from "../../discord-api.ts";
import { type GiveawayConfig, giveawayKey } from "../commands/giveaway.ts";
import { EmbedColors } from "../../constants.ts";

const PANEL_UPDATE_INTERVAL_MS = 5_000;
const MAX_ENTRANTS = 10_000;

export default defineComponent({
  customId: "giveaway-enter:",
  match: "prefix",
  type: "button",

  async execute({ customId, guildId, userId }) {
    const existing = await kv.get<GiveawayConfig>(giveawayKey(guildId));

    if (!existing || existing.ended) {
      return { success: false, error: "This giveaway has ended." };
    }

    if (existing.entrants.includes(userId)) {
      return { success: true, message: "You're already entered in this giveaway!" };
    }

    if (existing.entrants.length >= MAX_ENTRANTS) {
      return { success: false, error: "This giveaway has reached the maximum number of entries." };
    }

    let shouldUpdatePanel = false;
    const now = Date.now();

    const updated = await kv.update<GiveawayConfig>(giveawayKey(guildId), (config) => {
      if (!config || config.ended) return config!;
      if (!config.entrants.includes(userId) && config.entrants.length < MAX_ENTRANTS) {
        config.entrants.push(userId);
      }
      // Only flag a panel update if enough time has passed
      const lastUpdate = (config as any).lastPanelUpdate ?? 0;
      if (now - lastUpdate >= PANEL_UPDATE_INTERVAL_MS) {
        (config as any).lastPanelUpdate = now;
        shouldUpdatePanel = true;
      }
      return config;
    });

    if (!updated || updated.ended) {
      return { success: false, error: "This giveaway has ended." };
    }

    // Update panel to reflect new entrant count (throttled)
    if (shouldUpdatePanel) {
      const unixSeconds = Math.floor(updated.endsAt / 1000);
      await discordBotFetch("PATCH", `channels/${updated.channelId}/messages/${updated.messageId}`, {
        embeds: [
          {
            title: "\u{1F389} Giveaway",
            description: [
              `**Prize:** ${updated.prize}`,
              `**Ends:** <t:${unixSeconds}:R>`,
              `**Entries:** ${updated.entrants.length}`,
              `**Winners:** ${updated.winnersCount}`,
              "",
              "Click the button below to enter!",
            ].join("\n"),
            color: EmbedColors.INFO,
            footer: { text: `${updated.winnersCount} winner(s) will be chosen` },
          },
        ],
      });
    }

    return { success: true, message: `You've entered the giveaway for **${updated.prize}**!` };
  },
});
