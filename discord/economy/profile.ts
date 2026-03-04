/**
 * discord/economy/profile.ts
 *
 * Player profile data management — titles, badges, border colors.
 */

import { kv } from "../persistence/kv.ts";
import type { ProfileData } from "./types.ts";

function profileKey(guildId: string, userId: string): string {
  return `profile:${guildId}:${userId}`;
}

function createDefault(guildId: string, userId: string): ProfileData {
  const now = Date.now();
  return {
    userId,
    guildId,
    badgeIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

export const profile = {
  async getOrCreate(guildId: string, userId: string): Promise<ProfileData> {
    const existing = await kv.get<ProfileData>(profileKey(guildId, userId));
    if (existing) return existing;
    const data = createDefault(guildId, userId);
    await kv.set(profileKey(guildId, userId), data);
    return data;
  },

  async setTitle(guildId: string, userId: string, title: string): Promise<ProfileData> {
    return await kv.update<ProfileData>(profileKey(guildId, userId), (current) => {
      const data = current ?? createDefault(guildId, userId);
      data.title = title;
      data.updatedAt = Date.now();
      return data;
    });
  },

  async addBadge(guildId: string, userId: string, badgeId: string): Promise<ProfileData> {
    return await kv.update<ProfileData>(profileKey(guildId, userId), (current) => {
      const data = current ?? createDefault(guildId, userId);
      if (!data.badgeIds.includes(badgeId)) {
        data.badgeIds.push(badgeId);
      }
      // Auto-set active badge if first badge
      if (data.badgeIds.length === 1) {
        data.activeBadgeId = badgeId;
      }
      data.updatedAt = Date.now();
      return data;
    });
  },

  async setActiveBadge(guildId: string, userId: string, badgeId: string): Promise<{ success: boolean; data?: ProfileData; error?: string }> {
    let error: string | undefined;
    const data = await kv.update<ProfileData>(profileKey(guildId, userId), (current) => {
      const d = current ?? createDefault(guildId, userId);
      if (!d.badgeIds.includes(badgeId)) {
        error = "You don't own that badge.";
        return d;
      }
      d.activeBadgeId = badgeId;
      d.updatedAt = Date.now();
      return d;
    });
    if (error) return { success: false, error };
    return { success: true, data };
  },

  async setBorderColor(guildId: string, userId: string, color: number): Promise<ProfileData> {
    return await kv.update<ProfileData>(profileKey(guildId, userId), (current) => {
      const data = current ?? createDefault(guildId, userId);
      data.borderColor = color;
      data.updatedAt = Date.now();
      return data;
    });
  },
};

export const _internals = { profileKey, createDefault };
