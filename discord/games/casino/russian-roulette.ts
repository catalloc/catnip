/**
 * discord/games/casino/russian-roulette.ts
 *
 * Russian Roulette — 2-6 players join a lobby. Take turns pulling the trigger.
 * One chamber is loaded. Eliminated player loses, survivors split the pot.
 */

import { secureRandomIndex } from "../../helpers/crypto.ts";
import { kv } from "../../persistence/kv.ts";
import type { RussianRouletteSession } from "../types.ts";

const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes for lobby + game
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const CHAMBERS = 6;

function sessionKey(guildId: string, hostId: string): string {
  return `rroulette:${guildId}:${hostId}`;
}

export interface RRPullResult {
  fired: boolean;
  eliminatedId: string | null;
  nextPlayerId: string | null;
  chamber: number;
}

/** Pull the trigger. Returns whether the player was eliminated. */
export function pullTrigger(session: RussianRouletteSession): RRPullResult {
  const currentPlayerId = session.alivePlayers[session.currentTurn % session.alivePlayers.length];
  const chamber = secureRandomIndex(CHAMBERS);
  const fired = chamber === session.loadedChamber;

  if (fired) {
    return {
      fired: true,
      eliminatedId: currentPlayerId,
      nextPlayerId: null,
      chamber,
    };
  }

  // Advance to next player
  const nextIdx = (session.currentTurn + 1) % session.alivePlayers.length;
  return {
    fired: false,
    eliminatedId: null,
    nextPlayerId: session.alivePlayers[nextIdx],
    chamber,
  };
}

/** Calculate payout for survivors after someone is eliminated. */
export function calculateSurvivorPayout(totalPot: number, survivorCount: number): number {
  const afterHouse = Math.floor(totalPot * 0.95);
  return Math.floor(afterHouse / survivorCount);
}

export const russianRoulette = {
  async getSession(guildId: string, hostId: string): Promise<RussianRouletteSession | null> {
    const session = await kv.get<RussianRouletteSession>(sessionKey(guildId, hostId));
    if (session && Date.now() - session.createdAt > SESSION_TTL_MS) {
      await kv.delete(sessionKey(guildId, hostId));
      return null;
    }
    return session;
  },

  async createSession(
    guildId: string,
    hostId: string,
    channelId: string,
    bet: number,
  ): Promise<RussianRouletteSession> {
    const session: RussianRouletteSession = {
      guildId,
      hostId,
      channelId,
      bet,
      players: [hostId],
      alivePlayers: [],
      currentTurn: 0,
      loadedChamber: secureRandomIndex(CHAMBERS),
      status: "lobby",
      createdAt: Date.now(),
    };
    await kv.set(sessionKey(guildId, hostId), session);
    return session;
  },

  async updateSession(session: RussianRouletteSession): Promise<void> {
    await kv.set(sessionKey(session.guildId, session.hostId), session);
  },

  async deleteSession(guildId: string, hostId: string): Promise<void> {
    await kv.delete(sessionKey(guildId, hostId));
  },

  /** Start the game — transition from lobby to playing. */
  startGame(session: RussianRouletteSession): boolean {
    if (session.players.length < MIN_PLAYERS) return false;
    session.alivePlayers = [...session.players];
    session.status = "playing";
    session.currentTurn = 0;
    session.loadedChamber = secureRandomIndex(CHAMBERS);
    return true;
  },
};

export const _internals = {
  sessionKey, SESSION_TTL_MS, MIN_PLAYERS, MAX_PLAYERS, CHAMBERS,
};
