/**
 * Daily Command — Claim a daily coin reward
 *
 * File: discord/interactions/commands/daily.ts
 */

import { defineCommand } from "../define-command.ts";
import { accounts } from "../../games/accounts.ts";
import { gamesConfig } from "../../games/games-config.ts";
import { embed } from "../../helpers/embed-builder.ts";
import { EmbedColors } from "../../constants.ts";

export default defineCommand({
  name: "daily",
  description: "Claim your daily coin reward",

  options: [],

  registration: { type: "guild" },
  deferred: false,
  ephemeral: false,
  cooldown: 86400, // 24 hours

  async execute({ guildId, userId }) {
    const config = await gamesConfig.get(guildId);

    if (config.dailyEnabled === false) {
      return { success: false, error: "Daily rewards are disabled in this server." };
    }

    const min = config.dailyMin ?? 50;
    const max = config.dailyMax ?? 150;
    const reward = Math.floor(Math.random() * (max - min + 1)) + min;

    const account = await accounts.creditBalance(guildId, userId, reward);

    const e = embed()
      .title(`${config.currencyEmoji} Daily Reward`)
      .color(EmbedColors.SUCCESS)
      .description(
        `You received **${reward.toLocaleString()} ${config.currencyName}** ${config.currencyEmoji}!\n\n` +
        `Balance: **${account.balance.toLocaleString()} ${config.currencyName}**`,
      )
      .footer("Come back tomorrow for another reward!")
      .build();

    return { success: true, embed: e };
  },
});
