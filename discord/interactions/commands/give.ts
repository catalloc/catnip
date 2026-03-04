/**
 * Give Command — Admin grant or deduct coins
 *
 * File: discord/interactions/commands/give.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { accounts } from "../../games/accounts.ts";
import { gamesConfig } from "../../games/games-config.ts";

export default defineCommand({
  name: "give",
  description: "Grant or deduct coins from a user (admin only)",

  options: [
    {
      name: "user",
      description: "Target user",
      type: OptionTypes.USER,
      required: true,
    },
    {
      name: "amount",
      description: "Amount to give (negative to deduct)",
      type: OptionTypes.INTEGER,
      required: true,
    },
    {
      name: "reason",
      description: "Reason for the adjustment",
      type: OptionTypes.STRING,
      required: false,
    },
  ],

  registration: { type: "guild" },
  deferred: false,
  ephemeral: true,
  adminOnly: true,

  async execute({ guildId, options }) {
    const targetId = options?.user as string;
    const amount = options?.amount as number;
    const reason = (options?.reason as string) ?? "No reason provided";
    const config = await gamesConfig.get(guildId);

    if (amount === 0) {
      return { success: false, error: "Amount cannot be zero." };
    }

    if (amount > 0) {
      const account = await accounts.creditBalance(guildId, targetId, amount);
      return {
        success: true,
        message: `Gave **${amount.toLocaleString()} ${config.currencyName}** ${config.currencyEmoji} to <@${targetId}>.\nNew balance: **${account.balance.toLocaleString()}**\nReason: ${reason}`,
      };
    }

    // Negative amount — deduct
    const deductAmount = Math.abs(amount);
    const { success, account } = await accounts.debitBalance(guildId, targetId, deductAmount);
    if (!success) {
      return {
        success: false,
        error: `<@${targetId}> only has **${account.balance.toLocaleString()} ${config.currencyName}** — cannot deduct **${deductAmount.toLocaleString()}**.`,
      };
    }
    return {
      success: true,
      message: `Deducted **${deductAmount.toLocaleString()} ${config.currencyName}** ${config.currencyEmoji} from <@${targetId}>.\nNew balance: **${account.balance.toLocaleString()}**\nReason: ${reason}`,
    };
  },
});
