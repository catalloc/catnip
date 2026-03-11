/**
 * discord/games/casino/tictactoe.ts
 *
 * Tic-Tac-Toe — two players, 3x3 grid. First to get 3 in a row wins.
 */

import { kv } from "../../persistence/kv.ts";
import type { TicTacToeSession } from "../types.ts";

const SESSION_TTL_MS = 3 * 60 * 1000; // 3 minutes

function sessionKey(guildId: string, challengerId: string): string {
  return `ttt:${guildId}:${challengerId}`;
}

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6],            // diagonals
];

/** Check if a player (1 or 2) has won. */
export function checkWin(board: number[], player: 1 | 2): boolean {
  return WIN_LINES.some(([a, b, c]) =>
    board[a] === player && board[b] === player && board[c] === player
  );
}

/** Check if the board is full (draw). */
export function isBoardFull(board: number[]): boolean {
  return board.every((cell) => cell !== 0);
}

/** Format the board as a text grid. */
export function formatBoard(board: number[]): string {
  const EMPTY = ":black_large_square:";
  const X = ":x:";
  const O = ":o:";
  const symbols = [EMPTY, X, O];

  const rows: string[] = [];
  for (let r = 0; r < 3; r++) {
    rows.push(board.slice(r * 3, r * 3 + 3).map((c) => symbols[c]).join(""));
  }
  return rows.join("\n");
}

export const tictactoe = {
  async getSession(guildId: string, challengerId: string): Promise<TicTacToeSession | null> {
    const session = await kv.get<TicTacToeSession>(sessionKey(guildId, challengerId));
    if (session && Date.now() - session.createdAt > SESSION_TTL_MS) {
      await kv.delete(sessionKey(guildId, challengerId));
      return null;
    }
    return session;
  },

  async createSession(
    guildId: string,
    challengerId: string,
    targetId: string,
    channelId: string,
    bet: number,
  ): Promise<TicTacToeSession> {
    const session: TicTacToeSession = {
      guildId,
      challengerId,
      targetId,
      channelId,
      bet,
      board: Array(9).fill(0),
      currentPlayer: 1,
      status: "pending",
      createdAt: Date.now(),
    };
    await kv.set(sessionKey(guildId, challengerId), session);
    return session;
  },

  async updateSession(session: TicTacToeSession): Promise<void> {
    await kv.set(sessionKey(session.guildId, session.challengerId), session);
  },

  async deleteSession(guildId: string, challengerId: string): Promise<void> {
    await kv.delete(sessionKey(guildId, challengerId));
  },
};

export const _internals = { sessionKey, SESSION_TTL_MS, WIN_LINES };
