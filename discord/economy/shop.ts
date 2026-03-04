/**
 * discord/economy/shop.ts
 *
 * Shop catalog CRUD and purchase logic.
 */

import { kv } from "../persistence/kv.ts";
import { accounts } from "./accounts.ts";
import { jobs, getTierIndex } from "./jobs.ts";
import { profile } from "./profile.ts";
import { discordBotFetch } from "../discord-api.ts";
import type { ShopItem, ShopCatalog, JobTierId } from "./types.ts";

const MAX_SHOP_ITEMS = 50;

function shopKey(guildId: string): string {
  return `shop:${guildId}`;
}

function createDefault(guildId: string): ShopCatalog {
  return { guildId, items: [], updatedAt: Date.now() };
}

export const shop = {
  async getCatalog(guildId: string): Promise<ShopCatalog> {
    const existing = await kv.get<ShopCatalog>(shopKey(guildId));
    return existing ?? createDefault(guildId);
  },

  async addItem(guildId: string, item: Omit<ShopItem, "id" | "enabled">): Promise<{ success: boolean; error?: string; item?: ShopItem }> {
    let error: string | undefined;
    let newItem: ShopItem | undefined;

    await kv.update<ShopCatalog>(shopKey(guildId), (current) => {
      const catalog = current ?? createDefault(guildId);
      if (catalog.items.length >= MAX_SHOP_ITEMS) {
        error = `Shop is full (max ${MAX_SHOP_ITEMS} items).`;
        return catalog;
      }
      newItem = {
        ...item,
        id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        enabled: true,
      };
      catalog.items.push(newItem);
      catalog.updatedAt = Date.now();
      return catalog;
    });

    if (error) return { success: false, error };
    return { success: true, item: newItem };
  },

  async removeItem(guildId: string, itemId: string): Promise<boolean> {
    let removed = false;
    await kv.update<ShopCatalog>(shopKey(guildId), (current) => {
      if (!current) return createDefault(guildId);
      const idx = current.items.findIndex((i) => i.id === itemId);
      if (idx === -1) return current;
      current.items.splice(idx, 1);
      current.updatedAt = Date.now();
      removed = true;
      return current;
    });
    return removed;
  },

  async getEnabledItems(guildId: string): Promise<ShopItem[]> {
    const catalog = await this.getCatalog(guildId);
    return catalog.items.filter((i) => i.enabled);
  },

  /**
   * Purchase a shop item. Debit-first pattern.
   * Returns { success, error?, item? }
   */
  async buyItem(
    guildId: string,
    userId: string,
    itemId: string,
  ): Promise<{ success: boolean; error?: string; item?: ShopItem }> {
    const catalog = await this.getCatalog(guildId);
    const item = catalog.items.find((i) => i.id === itemId && i.enabled);

    if (!item) return { success: false, error: "Item not found or disabled." };

    // Debit first
    const { success, account } = await accounts.debitBalance(guildId, userId, item.price);
    if (!success) {
      return {
        success: false,
        error: `Insufficient funds. You have **${account.balance.toLocaleString()}** coins but need **${item.price.toLocaleString()}**.`,
      };
    }

    // Apply item effects
    if (item.type === "job-upgrade" && item.unlocksJobTier) {
      const currentJob = await jobs.getOrCreate(guildId, userId);
      const currentIdx = getTierIndex(currentJob.tierId);
      const targetIdx = getTierIndex(item.unlocksJobTier);
      if (targetIdx <= currentIdx) {
        // Refund — already have this tier or better
        await accounts.creditBalance(guildId, userId, item.price);
        return { success: false, error: "You already have this job tier or better!" };
      }
      await jobs.setTier(guildId, userId, item.unlocksJobTier);
    }

    if (item.type === "cosmetic-role" && item.roleId) {
      await discordBotFetch("PUT", `guilds/${guildId}/members/${userId}/roles/${item.roleId}`);
    }

    if (item.type === "profile-title" && item.profileTitle) {
      await profile.setTitle(guildId, userId, item.profileTitle);
    }

    if (item.type === "profile-badge" && item.profileBadge) {
      await profile.addBadge(guildId, userId, item.profileBadge);
    }

    if (item.type === "profile-border" && item.profileBorderColor != null) {
      await profile.setBorderColor(guildId, userId, item.profileBorderColor);
    }

    return { success: true, item };
  },
};

export const _internals = { shopKey, createDefault, MAX_SHOP_ITEMS };
