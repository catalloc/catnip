/**
 * Balance Command — Check your coins or another user's balance
 *
 * File: discord/interactions/commands/balance.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { accounts } from "../../games/accounts.ts";
import { gamesConfig } from "../../games/games-config.ts";
import { embed } from "../../helpers/embed-builder.ts";
import { EmbedColors } from "../../constants.ts";

export default defineCommand({
  name: "balance",
  description: "Check your coin balance",

  options: [
    {
      name: "user",
      description: "User to check (default: yourself)",
      type: OptionTypes.USER,
      required: false,
    },
  ],

  registration: { type: "guild" },
  deferred: false,
  ephemeral: true,

  async execute({ guildId, userId, options }) {
    const targetId = (options?.user as string) ?? userId;
    const isSelf = targetId === userId;
    const config = await gamesConfig.get(guildId);
    const account = await accounts.getOrCreate(guildId, targetId, config.startingBalance);

    const e = embed()
      .title(`${config.currencyEmoji} Balance`)
      .color(EmbedColors.INFO)
      .field("Balance", `${account.balance.toLocaleString()} ${config.currencyName}`, true)
      .field("Lifetime Earned", `${account.lifetimeEarned.toLocaleString()} ${config.currencyName}`, true)
      .footer(isSelf ? "Your balance" : `Balance for <@${targetId}>`)
      .build();

    return { success: true, embed: e };
  },
});
