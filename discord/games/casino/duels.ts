/**
 * discord/games/casino/duels.ts
 *
 * Duels — challenge another user. Both wager, coinflip decides the winner.
 */

import { secureRandomIndex } from "../../helpers/crypto.ts";
import { kv } from "../../persistence/kv.ts";
import type { DuelSession } from "../types.ts";

const SESSION_TTL_MS = 2 * 60 * 1000; // 2 minutes to accept

function sessionKey(guildId: string, challengerId: string): string {
  return `duel:${guildId}:${challengerId}`;
}

export interface DuelResult {
  winnerId: string;
  loserId: string;
  winnerPayout: number;
}

/** Resolve the duel with a coinflip. Winner gets 1.9x each bet (5% house cut). */
export function resolveDuel(session: DuelSession): DuelResult {
  const challengerWins = secureRandomIndex(2) === 0;
  const winnerId = challengerWins ? session.challengerId : session.targetId;
  const loserId = challengerWins ? session.targetId : session.challengerId;
  // Each player bet `session.bet`. Pot = 2 * bet. Winner gets 1.9x total pot share.
  const winnerPayout = Math.floor(session.bet * 2 * 0.95);

  return { winnerId, loserId, winnerPayout };
}

export const duels = {
  async getSession(guildId: string, challengerId: string): Promise<DuelSession | null> {
    const session = await kv.get<DuelSession>(sessionKey(guildId, challengerId));
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
  ): Promise<DuelSession> {
    const session: DuelSession = {
      guildId,
      challengerId,
      targetId,
      channelId,
      bet,
      status: "pending",
      createdAt: Date.now(),
    };
    await kv.set(sessionKey(guildId, challengerId), session);
    return session;
  },

  async deleteSession(guildId: string, challengerId: string): Promise<void> {
    await kv.delete(sessionKey(guildId, challengerId));
  },
};

export const _internals = { sessionKey, SESSION_TTL_MS };
