/**
 * Mines Action Component — Handle cell pick and cash-out button presses
 *
 * File: discord/interactions/components/mines-action.ts
 */

import { defineComponent } from "../define-component.ts";
import { accounts } from "../../games/accounts.ts";
import { gamesConfig } from "../../games/games-config.ts";
import { activityLock } from "../../games/activity-lock.ts";
import { mines, revealCell, formatGrid, GRID_SIZE } from "../../games/casino/mines.ts";
import { embed } from "../../helpers/embed-builder.ts";
import { EmbedColors } from "../../constants.ts";

function buildGridComponents(session: any, userId: string): any[] {
  const rows: any[] = [];
  for (let r = 0; r < 4; r++) {
    const buttons: any[] = [];
    for (let c = 0; c < 5; c++) {
      const idx = r * 5 + c;
      if (session.revealed[idx]) {
        buttons.push({
          type: 2, style: 2, label: "💎",
          custom_id: `mines:cell:${idx}:${userId}`,
          disabled: true,
        });
      } else {
        buttons.push({
          type: 2, style: 1, label: `${idx + 1}`,
          custom_id: `mines:cell:${idx}:${userId}`,
        });
      }
    }
    rows.push({ type: 1, components: buttons });
  }
  // Cash out row (only if at least 1 safe pick)
  if (session.safePicks > 0) {
    const payout = Math.floor(session.bet * session.currentMultiplier);
    rows.push({
      type: 1,
      components: [
        { type: 2, style: 3, label: `Cash Out (${payout.toLocaleString()})`, custom_id: `mines:cashout:0:${userId}` },
      ],
    });
  }
  return rows;
}

export default defineComponent({
  customId: "mines:",
  match: "prefix",
  type: "button",

  async execute({ customId, guildId, userId }) {
    const parts = customId.split(":");
    const action = parts[1]; // cell, cashout
    const cellIndex = parseInt(parts[2], 10);
    const targetUserId = parts[3];

    if (targetUserId !== userId) {
      return { success: false, error: "This isn't your game!" };
    }

    const session = await mines.getSession(guildId, userId);
    if (!session || session.status === "done") {
      return { success: false, error: "No active mines game." };
    }

    const config = await gamesConfig.get(guildId);

    if (action === "cashout") {
      const payout = Math.floor(session.bet * session.currentMultiplier);
      if (payout > 0) await accounts.creditBalance(guildId, userId, payout);
      await mines.deleteSession(guildId, userId);
      await activityLock.releaseLock(guildId, userId);
      const newAccount = await accounts.getOrCreate(guildId, userId);

      const e = embed()
        .title(`${config.currencyEmoji} Mines — Cashed Out!`)
        .color(EmbedColors.SUCCESS)
        .description(
          `${formatGrid(session, true)}\n\n` +
          `:gem: **${session.safePicks}** safe picks at **${session.currentMultiplier}x**\n` +
          `You won **${payout.toLocaleString()} ${config.currencyName}**!`,
        )
        .footer(`Balance: ${newAccount.balance.toLocaleString()} ${config.currencyName}`)
        .build();

      return { success: true, updateMessage: true, embed: e, components: [] };
    }

    if (action === "cell") {
      if (cellIndex < 0 || cellIndex >= GRID_SIZE || session.revealed[cellIndex]) {
        return { success: false, error: "Invalid cell." };
      }

      const { safe, multiplier } = revealCell(session, cellIndex);

      if (!safe) {
        // Hit a mine
        session.status = "done";
        await mines.deleteSession(guildId, userId);
        await activityLock.releaseLock(guildId, userId);
        const newAccount = await accounts.getOrCreate(guildId, userId);

        const e = embed()
          .title(`${config.currencyEmoji} Mines — BOOM!`)
          .color(EmbedColors.ERROR)
          .description(
            `${formatGrid(session, true)}\n\n` +
            `:boom: You hit a mine on cell **${cellIndex + 1}**!\n` +
            `You lost **${session.bet.toLocaleString()} ${config.currencyName}**.`,
          )
          .footer(`Balance: ${newAccount.balance.toLocaleString()} ${config.currencyName}`)
          .build();

        return { success: true, updateMessage: true, embed: e, components: [] };
      }

      // Safe pick
      await mines.updateSession(session);
      const safeCellsLeft = GRID_SIZE - session.mineCount - session.safePicks;
      const payout = Math.floor(session.bet * multiplier);

      // Check if all safe cells revealed
      if (safeCellsLeft === 0) {
        if (payout > 0) await accounts.creditBalance(guildId, userId, payout);
        await mines.deleteSession(guildId, userId);
        await activityLock.releaseLock(guildId, userId);
        const newAccount = await accounts.getOrCreate(guildId, userId);

        const e = embed()
          .title(`${config.currencyEmoji} Mines — Perfect Clear!`)
          .color(EmbedColors.SUCCESS)
          .description(
            `${formatGrid(session, true)}\n\n` +
            `:star2: You found ALL safe cells! **${multiplier}x**\n` +
            `You won **${payout.toLocaleString()} ${config.currencyName}**!`,
          )
          .footer(`Balance: ${newAccount.balance.toLocaleString()} ${config.currencyName}`)
          .build();

        return { success: true, updateMessage: true, embed: e, components: [] };
      }

      const e = embed()
        .title(`${config.currencyEmoji} Mines — Bet: ${session.bet.toLocaleString()}`)
        .color(EmbedColors.INFO)
        .description(
          `${formatGrid(session)}\n\n` +
          `:gem: Safe picks: **${session.safePicks}** | Multiplier: **${multiplier}x**\n` +
          `Potential payout: **${payout.toLocaleString()} ${config.currencyName}**\n` +
          `Mines: ${session.mineCount} | Safe cells left: ${safeCellsLeft}`,
        )
        .footer("Pick a cell or cash out!")
        .build();

      return { success: true, updateMessage: true, embed: e, components: buildGridComponents(session, userId) };
    }

    return { success: false, error: "Unknown action." };
  },
});
