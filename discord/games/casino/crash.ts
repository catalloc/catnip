/**
 * discord/games/casino/crash.ts
 *
 * Crash — multiplier climbs each step, cash out before it crashes.
 * Uses geometric progression: step n → 1.0 * 1.25^n
 */

import { secureRandomIndex } from "../../helpers/crypto.ts";
import { kv } from "../../persistence/kv.ts";
import type { CrashSession } from "../types.ts";

const SESSION_TTL_MS = 5 * 60 * 1000;
const STEP_BASE = 1.25;

function sessionKey(guildId: string, userId: string): string {
  return `crash:${guildId}:${userId}`;
}

/** Generate crash point with ~1% house edge, minimum 1.0, capped at 100x. */
export function generateCrashPoint(): number {
  const r = (secureRandomIndex(10000) + 1) / 10001;
  const raw = Math.floor((0.99 / r) * 100) / 100;
  return Math.max(1.0, Math.min(100, raw));
}

/** Calculate multiplier for a given step. */
export function multiplierAtStep(step: number): number {
  return Math.floor(Math.pow(STEP_BASE, step) * 100) / 100;
}

/** Advance one step. Returns the new session and whether it crashed. */
export function advanceStep(session: CrashSession): { crashed: boolean; newMultiplier: number } {
  const nextStep = session.currentStep + 1;
  const newMultiplier = multiplierAtStep(nextStep);

  if (newMultiplier > session.crashPoint) {
    return { crashed: true, newMultiplier };
  }

  session.currentStep = nextStep;
  session.currentMultiplier = newMultiplier;
  return { crashed: false, newMultiplier };
}

export const crash = {
  async getSession(guildId: string, userId: string): Promise<CrashSession | null> {
    const session = await kv.get<CrashSession>(sessionKey(guildId, userId));
    if (session && Date.now() - session.createdAt > SESSION_TTL_MS) {
      await kv.delete(sessionKey(guildId, userId));
      return null;
    }
    return session;
  },

  async createSession(guildId: string, userId: string, bet: number): Promise<CrashSession> {
    const session: CrashSession = {
      guildId,
      userId,
      bet,
      crashPoint: generateCrashPoint(),
      currentMultiplier: 1.0,
      currentStep: 0,
      status: "playing",
      createdAt: Date.now(),
    };
    await kv.set(sessionKey(guildId, userId), session);
    return session;
  },

  async updateSession(session: CrashSession): Promise<void> {
    await kv.set(sessionKey(session.guildId, session.userId), session);
  },

  async deleteSession(guildId: string, userId: string): Promise<void> {
    await kv.delete(sessionKey(guildId, userId));
  },
};

export const _internals = { sessionKey, SESSION_TTL_MS, STEP_BASE };
