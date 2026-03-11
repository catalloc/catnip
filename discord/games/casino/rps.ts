/**
 * discord/games/casino/rps.ts
 *
 * Rock Paper Scissors — challenge another player. Both pick secretly, reveal simultaneously.
 */

import { secureRandomIndex } from "../../helpers/crypto.ts";
import { kv } from "../../persistence/kv.ts";
import type { RpsSession } from "../types.ts";

const SESSION_TTL_MS = 2 * 60 * 1000; // 2 minutes to accept + pick

function sessionKey(guildId: string, challengerId: string): string {
  return `rps:${guildId}:${challengerId}`;
}

export type RpsChoice = "rock" | "paper" | "scissors";

export interface RpsResult {
  winnerId: string | null; // null = draw
  loserId: string | null;
  winnerPayout: number;
  challengerChoice: RpsChoice;
  targetChoice: RpsChoice;
  draw: boolean;
}

const BEATS: Record<RpsChoice, RpsChoice> = {
  rock: "scissors",
  paper: "rock",
  scissors: "paper",
};

export function resolveRps(session: RpsSession): RpsResult {
  const cc = session.challengerChoice!;
  const tc = session.targetChoice!;

  if (cc === tc) {
    return {
      winnerId: null,
      loserId: null,
      winnerPayout: 0,
      challengerChoice: cc,
      targetChoice: tc,
      draw: true,
    };
  }

  const challengerWins = BEATS[cc] === tc;
  const winnerId = challengerWins ? session.challengerId : session.targetId;
  const loserId = challengerWins ? session.targetId : session.challengerId;
  const winnerPayout = Math.floor(session.bet * 2 * 0.95);

  return { winnerId, loserId, winnerPayout, challengerChoice: cc, targetChoice: tc, draw: false };
}

const CHOICE_EMOJI: Record<RpsChoice, string> = {
  rock: ":rock:",
  paper: ":page_facing_up:",
  scissors: ":scissors:",
};

export function choiceEmoji(choice: RpsChoice): string {
  return CHOICE_EMOJI[choice];
}

export const rps = {
  async getSession(guildId: string, challengerId: string): Promise<RpsSession | null> {
    const session = await kv.get<RpsSession>(sessionKey(guildId, challengerId));
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
    rounds: 1 | 3 | 5,
  ): Promise<RpsSession> {
    const session: RpsSession = {
      guildId,
      challengerId,
      targetId,
      channelId,
      bet,
      rounds,
      currentRound: 1,
      challengerWins: 0,
      targetWins: 0,
      challengerChoice: null,
      targetChoice: null,
      status: "pending",
      createdAt: Date.now(),
    };
    await kv.set(sessionKey(guildId, challengerId), session);
    return session;
  },

  async updateSession(session: RpsSession): Promise<void> {
    await kv.set(sessionKey(session.guildId, session.challengerId), session);
  },

  async deleteSession(guildId: string, challengerId: string): Promise<void> {
    await kv.delete(sessionKey(guildId, challengerId));
  },
};

export const _internals = { sessionKey, SESSION_TTL_MS, BEATS };
