/**
 * Connect Four Action Component — Handle accept/decline and column drops
 *
 * File: discord/interactions/components/connect4-action.ts
 */

import { defineComponent } from "../define-component.ts";
import { accounts } from "../../games/accounts.ts";
import { gamesConfig } from "../../games/games-config.ts";
import { connect4, dropPiece, checkWin, isBoardFull, formatBoard, COLS } from "../../games/casino/connect4.ts";
import { xp, XP_AWARDS } from "../../games/xp.ts";
import { embed } from "../../helpers/embed-builder.ts";
import { EmbedColors } from "../../constants.ts";

function columnButtons(challengerId: string, board: number[][]): any[] {
  const buttons: any[] = [];
  for (let c = 0; c < COLS; c++) {
    const full = board[0][c] !== 0;
    buttons.push({
      type: 2,
      style: full ? 2 : 1,
      label: `${c + 1}`,
      custom_id: `c4:drop:${c}:${challengerId}`,
      disabled: full,
    });
  }
  return [{ type: 1, components: buttons }];
}

export default defineComponent({
  customId: "c4:",
  match: "prefix",
  type: "button",

  async execute({ customId, guildId, userId }) {
    const parts = customId.split(":");
    const action = parts[1]; // accept, decline, drop
    const challengerId = action === "drop" ? parts[3] : parts[2];

    const session = await connect4.getSession(guildId, challengerId);
    if (!session) {
      return { success: false, error: "This Connect Four game has expired or ended." };
    }

    const config = await gamesConfig.get(guildId);

    // ── Decline ──
    if (action === "decline") {
      if (userId !== session.targetId) {
        return { success: false, error: "This challenge isn't for you!" };
      }
      await accounts.creditBalance(guildId, session.challengerId, session.bet);
      await connect4.deleteSession(guildId, challengerId);

      const e = embed()
        .title(`${config.currencyEmoji} Connect Four — Declined`)
        .color(EmbedColors.WARNING)
        .description(`<@${userId}> declined. <@${challengerId}>'s bet has been refunded.`)
        .build();

      return { success: true, updateMessage: true, embed: e, components: [] };
    }

    // ── Accept ──
    if (action === "accept") {
      if (userId !== session.targetId) {
        return { success: false, error: "This challenge isn't for you!" };
      }

      const { success: debited } = await accounts.debitBalance(guildId, userId, session.bet);
      if (!debited) {
        return { success: false, error: `You need **${session.bet.toLocaleString()}** coins to accept!` };
      }

      session.status = "playing";
      await connect4.updateSession(session);

      const e = embed()
        .title(`${config.currencyEmoji} Connect Four`)
        .color(EmbedColors.INFO)
        .description(
          `${formatBoard(session.board)}\n\n` +
          `:red_circle: <@${session.challengerId}> vs :yellow_circle: <@${session.targetId}>\n` +
          `<@${session.challengerId}>'s turn!`,
        )
        .footer(`Wager: ${session.bet.toLocaleString()} ${config.currencyName} each`)
        .build();

      return {
        success: true,
        updateMessage: true,
        embed: e,
        components: columnButtons(challengerId, session.board),
      };
    }

    // ── Drop ──
    if (action === "drop") {
      if (session.status !== "playing") {
        return { success: false, error: "The game hasn't started yet!" };
      }

      const currentPlayerId = session.currentPlayer === 1 ? session.challengerId : session.targetId;
      if (userId !== currentPlayerId) {
        return { success: false, error: "It's not your turn!" };
      }

      const col = parseInt(parts[2], 10);
      if (col < 0 || col >= COLS) {
        return { success: false, error: "Invalid column!" };
      }

      const row = dropPiece(session.board, col, session.currentPlayer);
      if (row === -1) {
        return { success: false, error: "That column is full!" };
      }

      // Check for win
      if (checkWin(session.board, session.currentPlayer)) {
        const winnerId = currentPlayerId;
        const loserId = winnerId === session.challengerId ? session.targetId : session.challengerId;
        const winnerPayout = Math.floor(session.bet * 2 * 0.95);

        await accounts.creditBalance(guildId, winnerId, winnerPayout);
        await connect4.deleteSession(guildId, challengerId);

        await xp.grantXp(guildId, winnerId, XP_AWARDS.CASINO_WIN);
        await xp.grantXp(guildId, loserId, XP_AWARDS.CASINO_LOSS);

        const winnerAccount = await accounts.getOrCreate(guildId, winnerId);
        const loserAccount = await accounts.getOrCreate(guildId, loserId);

        const marker = session.currentPlayer === 1 ? ":red_circle:" : ":yellow_circle:";

        const e = embed()
          .title(`${config.currencyEmoji} Connect Four — ${marker} Wins!`)
          .color(EmbedColors.SUCCESS)
          .description(
            `${formatBoard(session.board)}\n\n` +
            `:trophy: <@${winnerId}> wins **${winnerPayout.toLocaleString()} ${config.currencyName}**!`,
          )
          .field("Winner Balance", `${winnerAccount.balance.toLocaleString()} ${config.currencyName}`, true)
          .field("Loser Balance", `${loserAccount.balance.toLocaleString()} ${config.currencyName}`, true)
          .build();

        return { success: true, updateMessage: true, embed: e, components: [] };
      }

      // Check for draw
      if (isBoardFull(session.board)) {
        await accounts.creditBalance(guildId, session.challengerId, session.bet);
        await accounts.creditBalance(guildId, session.targetId, session.bet);
        await connect4.deleteSession(guildId, challengerId);

        await xp.grantXp(guildId, session.challengerId, XP_AWARDS.CASINO_LOSS);
        await xp.grantXp(guildId, session.targetId, XP_AWARDS.CASINO_LOSS);

        const e = embed()
          .title(`${config.currencyEmoji} Connect Four — Draw!`)
          .color(EmbedColors.WARNING)
          .description(
            `${formatBoard(session.board)}\n\n` +
            `The board is full — it's a **draw**! Bets returned.`,
          )
          .build();

        return { success: true, updateMessage: true, embed: e, components: [] };
      }

      // Next turn
      session.currentPlayer = session.currentPlayer === 1 ? 2 : 1;
      await connect4.updateSession(session);

      const nextPlayerId = session.currentPlayer === 1 ? session.challengerId : session.targetId;
      const marker = session.currentPlayer === 1 ? ":red_circle:" : ":yellow_circle:";

      const e = embed()
        .title(`${config.currencyEmoji} Connect Four`)
        .color(EmbedColors.INFO)
        .description(
          `${formatBoard(session.board)}\n\n` +
          `:red_circle: <@${session.challengerId}> vs :yellow_circle: <@${session.targetId}>\n` +
          `${marker} <@${nextPlayerId}>'s turn!`,
        )
        .footer(`Wager: ${session.bet.toLocaleString()} ${config.currencyName} each`)
        .build();

      return {
        success: true,
        updateMessage: true,
        embed: e,
        components: columnButtons(challengerId, session.board),
      };
    }

    return { success: false, error: "Unknown action." };
  },
});
