/**
 * discord/economy/inventory.ts
 *
 * Consumable item definitions, player inventory CRUD, and carry-limit management.
 */

import { kv } from "../persistence/kv.ts";
import type {
  ConsumableItemId, ConsumableItemDefinition, PlayerInventory, InventorySlot,
} from "./types.ts";

// ── Consumable Item Definitions ─────────────────────────

export const CONSUMABLE_ITEMS: ConsumableItemDefinition[] = [
  { id: "health-potion", name: "Health Potion", emoji: "\u{1F9EA}", description: "Restore 40 HP", shopPrice: 50, effect: { type: "heal", amount: 40 } },
  { id: "greater-health-potion", name: "Greater Health Potion", emoji: "\u{1F9EA}", description: "Restore 100 HP", shopPrice: 200, effect: { type: "heal", amount: 100 } },
  { id: "mega-health-potion", name: "Mega Health Potion", emoji: "\u{1F9EA}", description: "Restore 50% max HP", shopPrice: 500, effect: { type: "heal-percent", percent: 0.5 } },
  { id: "damage-boost", name: "Strength Elixir", emoji: "\u2694\uFE0F", description: "1.5x damage for 3 turns", shopPrice: 100, effect: { type: "damage-boost", multiplier: 1.5, turns: 3 } },
  { id: "greater-damage-boost", name: "Berserker Brew", emoji: "\u2694\uFE0F", description: "2x damage for 2 turns", shopPrice: 350, effect: { type: "damage-boost", multiplier: 2, turns: 2 } },
  { id: "shield-potion", name: "Shield Potion", emoji: "\u{1F6E1}\uFE0F", description: "50% less damage for 2 turns", shopPrice: 80, effect: { type: "shield", reduction: 0.5, turns: 2 } },
  { id: "greater-shield-potion", name: "Iron Skin Potion", emoji: "\u{1F6E1}\uFE0F", description: "75% less damage for 2 turns", shopPrice: 300, effect: { type: "shield", reduction: 0.75, turns: 2 } },
  { id: "antidote", name: "Antidote", emoji: "\u{1F48A}", description: "Cleanse all debuffs", shopPrice: 60, effect: { type: "cleanse" } },
  { id: "revive-charm", name: "Revive Charm", emoji: "\u{1F48E}", description: "Auto-revive at 25% HP once", shopPrice: 1000, effect: { type: "revive", hpPercent: 0.25 } },
  { id: "bread", name: "Bread", emoji: "\u{1F35E}", description: "Restore 25 HP", shopPrice: null, effect: { type: "heal", amount: 25 } },
  { id: "stew", name: "Stew", emoji: "\u{1F372}", description: "Restore 75 HP", shopPrice: null, effect: { type: "heal", amount: 75 } },
  { id: "feast", name: "Feast", emoji: "\u{1F357}", description: "Restore 30% max HP", shopPrice: null, effect: { type: "heal-percent", percent: 0.3 } },
];

// ── Lookups ─────────────────────────────────────────────

export function getConsumableItem(id: ConsumableItemId): ConsumableItemDefinition | undefined {
  return CONSUMABLE_ITEMS.find((i) => i.id === id);
}

export function getShoppableItems(): ConsumableItemDefinition[] {
  return CONSUMABLE_ITEMS.filter((i) => i.shopPrice !== null);
}

// ── Constants ───────────────────────────────────────────

const DEFAULT_CARRY_LIMIT = 5;

// ── KV Key ──────────────────────────────────────────────

function inventoryKey(guildId: string, userId: string): string {
  return `inventory:${guildId}:${userId}`;
}

function createDefault(guildId: string, userId: string): PlayerInventory {
  return {
    guildId, userId,
    items: [],
    carryLimit: DEFAULT_CARRY_LIMIT,
    updatedAt: Date.now(),
  };
}

// ── Helpers ─────────────────────────────────────────────

function totalItemCount(items: InventorySlot[]): number {
  return items.reduce((sum, s) => sum + s.quantity, 0);
}

// ── Inventory API ───────────────────────────────────────

export const inventory = {
  async get(guildId: string, userId: string): Promise<PlayerInventory> {
    const existing = await kv.get<PlayerInventory>(inventoryKey(guildId, userId));
    return existing ?? createDefault(guildId, userId);
  },

  async addItem(
    guildId: string,
    userId: string,
    itemId: ConsumableItemId,
    quantity = 1,
  ): Promise<{ success: boolean; error?: string; inventory?: PlayerInventory }> {
    let error: string | undefined;
    let result: PlayerInventory | undefined;

    await kv.update<PlayerInventory>(inventoryKey(guildId, userId), (current) => {
      const inv = current ?? createDefault(guildId, userId);
      const currentCount = totalItemCount(inv.items);
      if (currentCount + quantity > inv.carryLimit) {
        error = `Inventory full! You're carrying **${currentCount}/${inv.carryLimit}** items. Upgrade your carry limit in the shop.`;
        return inv;
      }

      const slot = inv.items.find((s) => s.itemId === itemId);
      if (slot) {
        slot.quantity += quantity;
      } else {
        inv.items.push({ itemId, quantity });
      }
      inv.updatedAt = Date.now();
      result = inv;
      return inv;
    });

    if (error) return { success: false, error };
    return { success: true, inventory: result };
  },

  async removeItem(
    guildId: string,
    userId: string,
    itemId: ConsumableItemId,
    quantity = 1,
  ): Promise<{ success: boolean; error?: string }> {
    let error: string | undefined;

    await kv.update<PlayerInventory>(inventoryKey(guildId, userId), (current) => {
      const inv = current ?? createDefault(guildId, userId);
      const slot = inv.items.find((s) => s.itemId === itemId);
      if (!slot || slot.quantity < quantity) {
        error = "You don't have enough of that item.";
        return inv;
      }
      slot.quantity -= quantity;
      if (slot.quantity === 0) {
        inv.items = inv.items.filter((s) => s.itemId !== itemId);
      }
      inv.updatedAt = Date.now();
      return inv;
    });

    if (error) return { success: false, error };
    return { success: true };
  },

  async upgradeCarryLimit(
    guildId: string,
    userId: string,
    newLimit: number,
  ): Promise<{ success: boolean; error?: string }> {
    let error: string | undefined;

    await kv.update<PlayerInventory>(inventoryKey(guildId, userId), (current) => {
      const inv = current ?? createDefault(guildId, userId);
      if (newLimit <= inv.carryLimit) {
        error = `Your carry limit is already **${inv.carryLimit}** or higher.`;
        return inv;
      }
      inv.carryLimit = newLimit;
      inv.updatedAt = Date.now();
      return inv;
    });

    if (error) return { success: false, error };
    return { success: true };
  },

  async listItems(guildId: string, userId: string): Promise<InventorySlot[]> {
    const inv = await this.get(guildId, userId);
    return inv.items;
  },
};

export const _internals = { inventoryKey, createDefault, totalItemCount, DEFAULT_CARRY_LIMIT };
