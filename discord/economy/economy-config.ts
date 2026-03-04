/**
 * discord/economy/economy-config.ts
 *
 * Per-guild economy settings, stored separately from GuildConfig.
 */

import { kv } from "../persistence/kv.ts";
import type { EconomyGuildConfig } from "./types.ts";

function configKey(guildId: string): string {
  return `economy_config:${guildId}`;
}

function createDefault(guildId: string): EconomyGuildConfig {
  const now = Date.now();
  return {
    guildId,
    currencyName: "Coins",
    currencyEmoji: "\u{1FA99}",
    casinoEnabled: true,
    casinoMaxBet: 10000,
    casinoMinBet: 1,
    jobsEnabled: true,
    crimeEnabled: true,
    crimeFineEnabled: true,
    farmEnabled: true,
    mineEnabled: true,
    forageEnabled: true,
    trainEnabled: true,
    arenaEnabled: true,
    adventureEnabled: true,
    startingBalance: 0,
    createdAt: now,
    updatedAt: now,
  };
}

// In-isolate cache with 60-second TTL
const CACHE_TTL_MS = 60_000;
const configCache = new Map<string, { config: EconomyGuildConfig; expires: number }>();

export const economyConfig = {
  async get(guildId: string): Promise<EconomyGuildConfig> {
    const cached = configCache.get(guildId);
    if (cached && cached.expires > Date.now()) return cached.config;

    const existing = await kv.get<EconomyGuildConfig>(configKey(guildId));
    const config = existing ?? createDefault(guildId);
    configCache.set(guildId, { config, expires: Date.now() + CACHE_TTL_MS });
    return config;
  },

  async update(
    guildId: string,
    changes: Partial<Omit<EconomyGuildConfig, "guildId" | "createdAt" | "updatedAt">>,
  ): Promise<EconomyGuildConfig> {
    configCache.delete(guildId);
    return await kv.update<EconomyGuildConfig>(configKey(guildId), (current) => {
      const config = current ?? createDefault(guildId);
      Object.assign(config, changes);
      config.updatedAt = Date.now();
      return config;
    });
  },

  async reset(guildId: string): Promise<EconomyGuildConfig> {
    configCache.delete(guildId);
    const config = createDefault(guildId);
    await kv.set(configKey(guildId), config);
    return config;
  },
};

export const _internals = { configKey, createDefault, configCache, CACHE_TTL_MS };
