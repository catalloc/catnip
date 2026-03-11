/**
 * Crash Action Component — Handle continue/cash-out button presses
 *
 * File: discord/interactions/components/crash-action.ts
 */

import { defineComponent } from "../define-component.ts";
import { accounts } from "../../games/accounts.ts";
import { gamesConfig } from "../../games/games-config.ts";
import { activityLock } from "../../games/activity-lock.ts";
import { crash, advanceStep, multiplierAtStep } from "../../games/casino/crash.ts";
import { embed } from "../../helpers/embed-builder.ts";
import { EmbedColors } from "../../constants.ts";

export default defineComponent({
  customId: "crash:",
  match: "prefix",
  type: "button",

  async execute({ customId, guildId, userId }) {
    const parts = customId.split(":");
    const action = parts[1]; // continue, cashout
    const targetUserId = parts[2];

    if (targetUserId !== userId) {
      return { success: false, error: "This isn't your game!" };
    }

    const session = await crash.getSession(guildId, userId);
    if (!session || session.status === "done") {
      return { success: false, error: "No active crash game." };
    }

    const config = await gamesConfig.get(guildId);

    if (action === "cashout") {
      const payout = Math.floor(session.bet * session.currentMultiplier);
      if (payout > 0) await accounts.creditBalance(guildId, userId, payout);
      await crash.deleteSession(guildId, userId);
      await activityLock.releaseLock(guildId, userId);
      const newAccount = await accounts.getOrCreate(guildId, userId);

      const e = embed()
        .title(`${config.currencyEmoji} Crash — Cashed Out!`)
        .color(EmbedColors.SUCCESS)
        .description(
          `:chart_with_upwards_trend: You cashed out at **${session.currentMultiplier}x**!\n\n` +
          `You won **${payout.toLocaleString()} ${config.currencyName}**!`,
        )
        .footer(`Balance: ${newAccount.balance.toLocaleString()} ${config.currencyName}`)
        .build();

      return { success: true, updateMessage: true, embed: e, components: [] };
    }

    if (action === "continue") {
      const { crashed, newMultiplier } = advanceStep(session);

      if (crashed) {
        await crash.deleteSession(guildId, userId);
        await activityLock.releaseLock(guildId, userId);
        const newAccount = await accounts.getOrCreate(guildId, userId);

        const e = embed()
          .title(`${config.currencyEmoji} Crash — Crashed!`)
          .color(EmbedColors.ERROR)
          .description(
            `:chart_with_downwards_trend: **CRASHED at ${newMultiplier}x!**\n` +
            `The crash point was **${session.crashPoint}x**.\n\n` +
            `You lost **${session.bet.toLocaleString()} ${config.currencyName}**.`,
          )
          .footer(`Balance: ${newAccount.balance.toLocaleString()} ${config.currencyName}`)
          .build();

        return { success: true, updateMessage: true, embed: e, components: [] };
      }

      // Still going
      await crash.updateSession(session);
      const potentialPayout = Math.floor(session.bet * session.currentMultiplier);
      const nextMultiplier = multiplierAtStep(session.currentStep + 1);

      const e = embed()
        .title(`${config.currencyEmoji} Crash — Bet: ${session.bet.toLocaleString()}`)
        .color(EmbedColors.INFO)
        .description(
          `:chart_with_upwards_trend: Current: **${session.currentMultiplier}x**\n` +
          `Potential payout: **${potentialPayout.toLocaleString()} ${config.currencyName}**\n` +
          `Next step: **${nextMultiplier}x**`,
        )
        .footer("Continue to go higher, or cash out now!")
        .build();

      const components = [
        {
          type: 1,
          components: [
            { type: 2, style: 1, label: `Continue → ${nextMultiplier}x`, custom_id: `crash:continue:${userId}` },
            { type: 2, style: 3, label: `Cash Out (${potentialPayout.toLocaleString()})`, custom_id: `crash:cashout:${userId}` },
          ],
        },
      ];

      return { success: true, updateMessage: true, embed: e, components };
    }

    return { success: false, error: "Unknown action." };
  },
});
