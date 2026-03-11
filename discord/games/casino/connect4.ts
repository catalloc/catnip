/**
 * discord/games/casino/connect4.ts
 *
 * Connect Four — two players take turns dropping pieces into a 7x6 grid.
 * First to connect 4 in a row (horizontal, vertical, diagonal) wins.
 */

import { kv } from "../../persistence/kv.ts";
import type { Connect4Session } from "../types.ts";

const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const ROWS = 6;
export const COLS = 7;

function sessionKey(guildId: string, challengerId: string): string {
  return `c4:${guildId}:${challengerId}`;
}

/** Create an empty board (6 rows x 7 cols, all 0). */
export function createBoard(): number[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

/** Drop a piece into a column. Returns the row it landed on, or -1 if full. */
export function dropPiece(board: number[][], col: number, player: 1 | 2): number {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[row][col] === 0) {
      board[row][col] = player;
      return row;
    }
  }
  return -1;
}

/** Check if a player has won. */
export function checkWin(board: number[][], player: 1 | 2): boolean {
  // Horizontal
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      if (board[r][c] === player && board[r][c + 1] === player &&
          board[r][c + 2] === player && board[r][c + 3] === player) return true;
    }
  }
  // Vertical
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] === player && board[r + 1][c] === player &&
          board[r + 2][c] === player && board[r + 3][c] === player) return true;
    }
  }
  // Diagonal (down-right)
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      if (board[r][c] === player && board[r + 1][c + 1] === player &&
          board[r + 2][c + 2] === player && board[r + 3][c + 3] === player) return true;
    }
  }
  // Diagonal (down-left)
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 3; c < COLS; c++) {
      if (board[r][c] === player && board[r + 1][c - 1] === player &&
          board[r + 2][c - 2] === player && board[r + 3][c - 3] === player) return true;
    }
  }
  return false;
}

/** Check if the board is full (draw). */
export function isBoardFull(board: number[][]): boolean {
  return board[0].every((cell) => cell !== 0);
}

/** Format the board as a text grid with Discord emojis. */
export function formatBoard(board: number[][]): string {
  const EMPTY = ":black_circle:";
  const P1 = ":red_circle:";
  const P2 = ":yellow_circle:";
  const symbols = [EMPTY, P1, P2];

  const rows = board.map((row) => row.map((cell) => symbols[cell]).join(""));
  rows.push(":one::two::three::four::five::six::seven:");
  return rows.join("\n");
}

export const connect4 = {
  async getSession(guildId: string, challengerId: string): Promise<Connect4Session | null> {
    const session = await kv.get<Connect4Session>(sessionKey(guildId, challengerId));
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
  ): Promise<Connect4Session> {
    const session: Connect4Session = {
      guildId,
      challengerId,
      targetId,
      channelId,
      bet,
      board: createBoard(),
      currentPlayer: 1,
      status: "pending",
      createdAt: Date.now(),
    };
    await kv.set(sessionKey(guildId, challengerId), session);
    return session;
  },

  async updateSession(session: Connect4Session): Promise<void> {
    await kv.set(sessionKey(session.guildId, session.challengerId), session);
  },

  async deleteSession(guildId: string, challengerId: string): Promise<void> {
    await kv.delete(sessionKey(guildId, challengerId));
  },
};

export const _internals = { sessionKey, SESSION_TTL_MS };
