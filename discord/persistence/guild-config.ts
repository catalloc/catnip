/**
 * discord/persistence/guild-config.ts
 *
 * Per-guild configuration stored via the existing KV layer.
 * Keys: `guild_config:{guildId}`
 */

import { kv } from "./kv.ts";

const KV_PREFIX = "guild_config:";
const MAX_ADMIN_ROLES = 25;

export interface GuildConfig {
  guildId: string;
  adminRoleIds: string[];
  enabledCommands: string[];
  createdAt: string;
  updatedAt: string;
}

function kvKey(guildId: string): string {
  return `${KV_PREFIX}${guildId}`;
}

function createDefault(guildId: string): GuildConfig {
  const now = new Date().toISOString();
  return {
    guildId,
    adminRoleIds: [],
    enabledCommands: [],
    createdAt: now,
    updatedAt: now,
  };
}

export { MAX_ADMIN_ROLES };

export const guildConfig = {
  async get(guildId: string): Promise<GuildConfig | null> {
    return await kv.get<GuildConfig>(kvKey(guildId));
  },

  async getAdminRoleIds(guildId: string): Promise<string[]> {
    const config = await kv.get<GuildConfig>(kvKey(guildId));
    return config?.adminRoleIds ?? [];
  },

  async getEnabledCommands(guildId: string): Promise<string[]> {
    const config = await kv.get<GuildConfig>(kvKey(guildId));
    return config?.enabledCommands ?? [];
  },

  async setAdminRoles(guildId: string, roleIds: string[]): Promise<void> {
    await kv.update<GuildConfig>(kvKey(guildId), (current) => {
      const config = current ?? createDefault(guildId);
      config.adminRoleIds = roleIds;
      config.updatedAt = new Date().toISOString();
      return config;
    });
  },

  async addAdminRole(guildId: string, roleId: string): Promise<boolean> {
    let added = false;
    await kv.update<GuildConfig>(kvKey(guildId), (current) => {
      const config = current ?? createDefault(guildId);
      if (config.adminRoleIds.includes(roleId)) {
        added = false;
        return config;
      }
      if (config.adminRoleIds.length >= MAX_ADMIN_ROLES) {
        added = false;
        return config;
      }
      config.adminRoleIds.push(roleId);
      config.updatedAt = new Date().toISOString();
      added = true;
      return config;
    });
    return added;
  },

  async removeAdminRole(guildId: string, roleId: string): Promise<boolean> {
    let removed = false;
    await kv.update<GuildConfig>(kvKey(guildId), (current) => {
      if (!current) {
        removed = false;
        return createDefault(guildId);
      }
      const idx = current.adminRoleIds.indexOf(roleId);
      if (idx === -1) {
        removed = false;
        return current;
      }
      current.adminRoleIds.splice(idx, 1);
      current.updatedAt = new Date().toISOString();
      removed = true;
      return current;
    });
    return removed;
  },

  async enableCommand(guildId: string, commandName: string): Promise<boolean> {
    let enabled = false;
    await kv.update<GuildConfig>(kvKey(guildId), (current) => {
      const config = current ?? createDefault(guildId);
      if (config.enabledCommands.includes(commandName)) {
        enabled = false;
        return config;
      }
      config.enabledCommands.push(commandName);
      config.updatedAt = new Date().toISOString();
      enabled = true;
      return config;
    });
    return enabled;
  },

  async disableCommand(guildId: string, commandName: string): Promise<boolean> {
    let disabled = false;
    await kv.update<GuildConfig>(kvKey(guildId), (current) => {
      if (!current) {
        disabled = false;
        return createDefault(guildId);
      }
      const idx = current.enabledCommands.indexOf(commandName);
      if (idx === -1) {
        disabled = false;
        return current;
      }
      current.enabledCommands.splice(idx, 1);
      current.updatedAt = new Date().toISOString();
      disabled = true;
      return current;
    });
    return disabled;
  },

  async listGuilds(): Promise<GuildConfig[]> {
    const entries = await kv.list(KV_PREFIX);
    return entries
      .map((e) => e.value as GuildConfig)
      .filter((c) => c && c.guildId);
  },
};
