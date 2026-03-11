/**
 * Duel Action Component — Handle accept/decline button presses
 *
 * File: discord/interactions/components/duel-action.ts
 */

import { defineComponent } from "../define-component.ts";
import { accounts } from "../../games/accounts.ts";
import { gamesConfig } from "../../games/games-config.ts";
import { duels, resolveDuel } from "../../games/casino/duels.ts";
import { xp, XP_AWARDS } from "../../games/xp.ts";
import { embed } from "../../helpers/embed-builder.ts";
import { EmbedColors } from "../../constants.ts";

export default defineComponent({
  customId: "duel:",
  match: "prefix",
  type: "button",

  async execute({ customId, guildId, userId }) {
    const parts = customId.split(":");
    const action = parts[1]; // accept, decline
    const challengerId = parts[2];

    const session = await duels.getSession(guildId, challengerId);
    if (!session || session.status === "done") {
      return { success: false, error: "This duel has expired or already been resolved." };
    }

    // Only the target can accept/decline
    if (userId !== session.targetId) {
      return { success: false, error: "This duel isn't for you!" };
    }

    const config = await gamesConfig.get(guildId);

    if (action === "decline") {
      // Refund challenger
      await accounts.creditBalance(guildId, session.challengerId, session.bet);
      await duels.deleteSession(guildId, challengerId);

      const e = embed()
        .title(`${config.currencyEmoji} Duel — Declined`)
        .color(EmbedColors.WARNING)
        .description(`<@${userId}> declined the duel. <@${challengerId}>'s bet has been refunded.`)
        .build();

      return { success: true, updateMessage: true, embed: e, components: [] };
    }

    if (action === "accept") {
      // Debit target's balance
      const targetAccount = await accounts.getOrCreate(guildId, userId);
      if (targetAccount.balance < session.bet) {
        return { success: false, error: `You don't have enough coins! Need **${session.bet.toLocaleString()}**.` };
      }

      const { success: debited } = await accounts.debitBalance(guildId, userId, session.bet);
      if (!debited) {
        return { success: false, error: "Insufficient funds." };
      }

      // Resolve duel
      const result = resolveDuel(session);

      // Pay winner
      await accounts.creditBalance(guildId, result.winnerId, result.winnerPayout);
      await duels.deleteSession(guildId, challengerId);

      // Grant XP
      await xp.grantXp(guildId, result.winnerId, XP_AWARDS.CASINO_WIN);
      await xp.grantXp(guildId, result.loserId, XP_AWARDS.CASINO_LOSS);

      const winnerAccount = await accounts.getOrCreate(guildId, result.winnerId);
      const loserAccount = await accounts.getOrCreate(guildId, result.loserId);

      const e = embed()
        .title(`${config.currencyEmoji} Duel — Result!`)
        .color(EmbedColors.SUCCESS)
        .description(
          `:crossed_swords: <@${session.challengerId}> vs <@${session.targetId}>\n\n` +
          `:trophy: <@${result.winnerId}> wins **${result.winnerPayout.toLocaleString()} ${config.currencyName}**!`,
        )
        .field("Winner Balance", `${winnerAccount.balance.toLocaleString()} ${config.currencyName}`, true)
        .field("Loser Balance", `${loserAccount.balance.toLocaleString()} ${config.currencyName}`, true)
        .build();

      return { success: true, updateMessage: true, embed: e, components: [] };
    }

    return { success: false, error: "Unknown action." };
  },
});
