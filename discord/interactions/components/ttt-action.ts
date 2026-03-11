/**
 * Tic-Tac-Toe Action Component — Handle accept/decline and cell picks
 *
 * File: discord/interactions/components/ttt-action.ts
 */

import { defineComponent } from "../define-component.ts";
import { accounts } from "../../games/accounts.ts";
import { gamesConfig } from "../../games/games-config.ts";
import { tictactoe, checkWin, isBoardFull, formatBoard } from "../../games/casino/tictactoe.ts";
import { xp, XP_AWARDS } from "../../games/xp.ts";
import { embed } from "../../helpers/embed-builder.ts";
import { EmbedColors } from "../../constants.ts";

function gridButtons(challengerId: string, board: number[]): any[] {
  const rows: any[] = [];
  const EMPTY = "\u200b"; // zero-width space
  const LABELS = ["", "X", "O"];

  for (let r = 0; r < 3; r++) {
    const buttons: any[] = [];
    for (let c = 0; c < 3; c++) {
      const idx = r * 3 + c;
      const cell = board[idx];
      buttons.push({
        type: 2,
        style: cell === 0 ? 2 : (cell === 1 ? 4 : 1),
        label: cell === 0 ? EMPTY : LABELS[cell],
        custom_id: `ttt:cell:${idx}:${challengerId}`,
        disabled: cell !== 0,
      });
    }
    rows.push({ type: 1, components: buttons });
  }
  return rows;
}

export default defineComponent({
  customId: "ttt:",
  match: "prefix",
  type: "button",

  async execute({ customId, guildId, userId }) {
    const parts = customId.split(":");
    const action = parts[1]; // accept, decline, cell
    const challengerId = action === "cell" ? parts[3] : parts[2];

    const session = await tictactoe.getSession(guildId, challengerId);
    if (!session) {
      return { success: false, error: "This Tic-Tac-Toe game has expired or ended." };
    }

    const config = await gamesConfig.get(guildId);

    // ── Decline ──
    if (action === "decline") {
      if (userId !== session.targetId) {
        return { success: false, error: "This challenge isn't for you!" };
      }
      await accounts.creditBalance(guildId, session.challengerId, session.bet);
      await tictactoe.deleteSession(guildId, challengerId);

      const e = embed()
        .title(`${config.currencyEmoji} Tic-Tac-Toe — Declined`)
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
      await tictactoe.updateSession(session);

      const e = embed()
        .title(`${config.currencyEmoji} Tic-Tac-Toe`)
        .color(EmbedColors.INFO)
        .description(
          `:x: <@${session.challengerId}> vs :o: <@${session.targetId}>\n` +
          `<@${session.challengerId}>'s turn!`,
        )
        .footer(`Wager: ${session.bet.toLocaleString()} ${config.currencyName} each`)
        .build();

      return {
        success: true,
        updateMessage: true,
        embed: e,
        components: gridButtons(challengerId, session.board),
      };
    }

    // ── Cell ──
    if (action === "cell") {
      if (session.status !== "playing") {
        return { success: false, error: "The game hasn't started yet!" };
      }

      const currentPlayerId = session.currentPlayer === 1 ? session.challengerId : session.targetId;
      if (userId !== currentPlayerId) {
        return { success: false, error: "It's not your turn!" };
      }

      const idx = parseInt(parts[2], 10);
      if (idx < 0 || idx > 8 || session.board[idx] !== 0) {
        return { success: false, error: "Invalid or occupied cell!" };
      }

      session.board[idx] = session.currentPlayer;

      // Check for win
      if (checkWin(session.board, session.currentPlayer)) {
        const winnerId = currentPlayerId;
        const loserId = winnerId === session.challengerId ? session.targetId : session.challengerId;
        const winnerPayout = Math.floor(session.bet * 2 * 0.95);

        await accounts.creditBalance(guildId, winnerId, winnerPayout);
        await tictactoe.deleteSession(guildId, challengerId);

        await xp.grantXp(guildId, winnerId, XP_AWARDS.CASINO_WIN);
        await xp.grantXp(guildId, loserId, XP_AWARDS.CASINO_LOSS);

        const winnerAccount = await accounts.getOrCreate(guildId, winnerId);
        const loserAccount = await accounts.getOrCreate(guildId, loserId);

        const marker = session.currentPlayer === 1 ? ":x:" : ":o:";

        const e = embed()
          .title(`${config.currencyEmoji} Tic-Tac-Toe — ${marker} Wins!`)
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
        await tictactoe.deleteSession(guildId, challengerId);

        await xp.grantXp(guildId, session.challengerId, XP_AWARDS.CASINO_LOSS);
        await xp.grantXp(guildId, session.targetId, XP_AWARDS.CASINO_LOSS);

        const e = embed()
          .title(`${config.currencyEmoji} Tic-Tac-Toe — Draw!`)
          .color(EmbedColors.WARNING)
          .description(
            `${formatBoard(session.board)}\n\n` +
            `It's a **draw**! Bets returned.`,
          )
          .build();

        return { success: true, updateMessage: true, embed: e, components: [] };
      }

      // Next turn
      session.currentPlayer = session.currentPlayer === 1 ? 2 : 1;
      await tictactoe.updateSession(session);

      const nextPlayerId = session.currentPlayer === 1 ? session.challengerId : session.targetId;
      const marker = session.currentPlayer === 1 ? ":x:" : ":o:";

      const e = embed()
        .title(`${config.currencyEmoji} Tic-Tac-Toe`)
        .color(EmbedColors.INFO)
        .description(
          `:x: <@${session.challengerId}> vs :o: <@${session.targetId}>\n` +
          `${marker} <@${nextPlayerId}>'s turn!`,
        )
        .footer(`Wager: ${session.bet.toLocaleString()} ${config.currencyName} each`)
        .build();

      return {
        success: true,
        updateMessage: true,
        embed: e,
        components: gridButtons(challengerId, session.board),
      };
    }

    return { success: false, error: "Unknown action." };
  },
});
