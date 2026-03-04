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
    startingBalance: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export const economyConfig = {
  async get(guildId: string): Promise<EconomyGuildConfig> {
    const existing = await kv.get<EconomyGuildConfig>(configKey(guildId));
    return existing ?? createDefault(guildId);
  },

  async update(
    guildId: string,
    changes: Partial<Omit<EconomyGuildConfig, "guildId" | "createdAt" | "updatedAt">>,
  ): Promise<EconomyGuildConfig> {
    return await kv.update<EconomyGuildConfig>(configKey(guildId), (current) => {
      const config = current ?? createDefault(guildId);
      Object.assign(config, changes);
      config.updatedAt = Date.now();
      return config;
    });
  },

  async reset(guildId: string): Promise<EconomyGuildConfig> {
    const config = createDefault(guildId);
    await kv.set(configKey(guildId), config);
    return config;
  },
};

export const _internals = { configKey, createDefault };
