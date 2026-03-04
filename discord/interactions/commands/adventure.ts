/**
 * Adventure Command — Multi-floor dungeon crawling
 *
 * File: discord/interactions/commands/adventure.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { economyConfig } from "../../economy/economy-config.ts";
import { training, computeDerivedStats } from "../../economy/training.ts";
import { getWeapon, hpBar } from "../../economy/combat.ts";
import {
  DUNGEONS, getDungeon, dungeon,
} from "../../economy/dungeon.ts";
import {
  CONSUMABLE_ITEMS, getConsumableItem, getShoppableItems, inventory,
} from "../../economy/inventory.ts";
import { activityLock } from "../../economy/activity-lock.ts";
import { accounts } from "../../economy/accounts.ts";
import { xp } from "../../economy/xp.ts";
import { embed } from "../../helpers/embed-builder.ts";
import { EmbedColors } from "../../constants.ts";
import type { ConsumableItemId } from "../../economy/types.ts";

export default defineCommand({
  name: "adventure",
  description: "Explore multi-floor dungeons for loot and glory",

  options: [
    {
      name: "enter",
      description: "Enter a dungeon",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "dungeon",
          description: "Which dungeon to enter",
          type: OptionTypes.STRING,
          required: true,
          choices: DUNGEONS.map((d) => ({ name: `${d.emoji} ${d.name} (Lv.${d.requiredLevel})`, value: d.id })),
        },
      ],
    },
    {
      name: "dungeons",
      description: "View available dungeons",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
    {
      name: "inventory",
      description: "View your consumable items",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
    {
      name: "buy",
      description: "Buy a consumable item",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "item",
          description: "Item to buy",
          type: OptionTypes.STRING,
          required: true,
          choices: getShoppableItems().map((i) => ({
            name: `${i.emoji} ${i.name} (${i.shopPrice} coins)`,
            value: i.id,
          })),
        },
        {
          name: "quantity",
          description: "How many to buy (default: 1)",
          type: OptionTypes.INTEGER,
          required: false,
        },
      ],
    },
  ],

  registration: { type: "guild" },
  deferred: false,
  ephemeral: false,

  async execute({ guildId, userId, options }) {
    const sub = options?.subcommand as string | undefined;
    const config = await economyConfig.get(guildId);

    if (!config.adventureEnabled) {
      return { success: false, error: "Adventures are disabled in this server." };
    }

    if (sub === "enter") {
      const dungeonId = options?.dungeon as string;
      const dungeonDef = getDungeon(dungeonId);
      if (!dungeonDef) return { success: false, error: "Unknown dungeon." };

      const playerLevel = await xp.getLevel(guildId, userId);
      if (playerLevel < dungeonDef.requiredLevel) {
        return { success: false, error: `You need to be **Level ${dungeonDef.requiredLevel}** to enter **${dungeonDef.name}**. You're Level ${playerLevel}.` };
      }

      const lockResult = await activityLock.acquireLock(guildId, userId, "adventure", dungeonDef.name);
      if (!lockResult.success) return { success: false, error: lockResult.error };

      const existing = await dungeon.getSession(guildId, userId);
      if (existing && (existing.status === "combat" || existing.status === "floor-cleared")) {
        await activityLock.releaseLock(guildId, userId);
        return { success: false, error: "You already have an active dungeon session! Use the buttons to continue." };
      }

      const stats = await training.getStats(guildId, userId);
      const weapon = stats.equippedWeaponId ? getWeapon(stats.equippedWeaponId) : undefined;
      const derived = computeDerivedStats(stats, playerLevel, weapon);

      const playerInv = await inventory.get(guildId, userId);
      const session = await dungeon.createSession(guildId, userId, dungeonDef, derived, playerInv.items);

      const combat = session.combat!;
      const hasSkills = derived.unlockedSkills.length > 0;
      const hasItems = session.dungeonInventory.length > 0;

      const e = embed()
        .title(`${dungeonDef.emoji} ${dungeonDef.name} — Floor 1`)
        .color(EmbedColors.INFO)
        .description(
          `Room ${session.currentRoom}/${session.totalRoomsOnFloor}\n\n` +
          `:heart: You: ${hpBar(session.playerHp, session.playerMaxHp)} ${session.playerHp}/${session.playerMaxHp} HP\n` +
          `:skull: ${combat.monster.name}: ${hpBar(combat.monsterHp, combat.monsterMaxHp)} ${combat.monsterHp}/${combat.monsterMaxHp} HP\n\n` +
          `**Turn 0** — Adventure begins!`,
        )
        .footer("Choose an action below")
        .build();

      const components = buildCombatComponents(userId, hasSkills, hasItems, derived.unlockedSkills);

      return { success: true, embed: e, components };
    }

    if (sub === "dungeons") {
      const playerLevel = await xp.getLevel(guildId, userId);
      const lines = DUNGEONS.map((d) => {
        const locked = playerLevel < d.requiredLevel ? " :lock:" : " :white_check_mark:";
        return `${d.emoji} **${d.name}**${locked} — Lv.${d.requiredLevel} | ${d.floors} floors | ${d.baseCoinsPerFloor}-${d.baseCoinsPerFloor * d.floors} ${config.currencyName}/floor\n> ${d.description}`;
      });

      const e = embed()
        .title(`:compass: Dungeons`)
        .description(lines.join("\n\n"))
        .color(EmbedColors.INFO)
        .footer(`Your level: ${playerLevel}`)
        .build();

      return { success: true, embed: e };
    }

    if (sub === "inventory") {
      const playerInv = await inventory.get(guildId, userId);
      const totalCount = playerInv.items.reduce((s, i) => s + i.quantity, 0);

      if (playerInv.items.length === 0) {
        return { success: true, message: `Your inventory is empty. (**${totalCount}/${playerInv.carryLimit}** items)\nBuy items with \`/adventure buy\`.` };
      }

      const lines = playerInv.items.map((slot) => {
        const def = getConsumableItem(slot.itemId);
        return def ? `${def.emoji} **${def.name}** x${slot.quantity} — ${def.description}` : `? **${slot.itemId}** x${slot.quantity}`;
      });

      const e = embed()
        .title(`:school_satchel: Inventory (${totalCount}/${playerInv.carryLimit})`)
        .description(lines.join("\n"))
        .color(EmbedColors.INFO)
        .build();

      return { success: true, embed: e, ephemeral: true };
    }

    if (sub === "buy") {
      const itemId = options?.item as ConsumableItemId;
      const quantity = (options?.quantity as number) || 1;
      const itemDef = getConsumableItem(itemId);
      if (!itemDef || itemDef.shopPrice === null) {
        return { success: false, error: "That item is not available for purchase." };
      }

      const totalCost = itemDef.shopPrice * quantity;
      const { success, account } = await accounts.debitBalance(guildId, userId, totalCost);
      if (!success) {
        return {
          success: false,
          error: `Insufficient funds. You have **${account.balance.toLocaleString()}** coins but need **${totalCost.toLocaleString()}**.`,
        };
      }

      const addResult = await inventory.addItem(guildId, userId, itemId, quantity);
      if (!addResult.success) {
        // Refund
        await accounts.creditBalance(guildId, userId, totalCost);
        return { success: false, error: addResult.error };
      }

      return {
        success: true,
        message: `${config.currencyEmoji} Purchased **${quantity}x ${itemDef.name}** for **${totalCost.toLocaleString()} ${config.currencyName}**!`,
        ephemeral: true,
      };
    }

    return { success: false, error: "Please use a subcommand: enter, dungeons, inventory, or buy." };
  },
});

// ── Component Builders ──

export function buildCombatComponents(
  userId: string,
  hasSkills: boolean,
  hasItems: boolean,
  unlockedSkills: { name: string; effect: string }[],
): any[] {
  const components: any[] = [
    {
      type: 1,
      components: [
        { type: 2, style: 1, label: "Attack", custom_id: `adv:attack:${userId}` },
        { type: 2, style: 3, label: "Skill", custom_id: `adv:skill:${userId}`, disabled: !hasSkills },
        { type: 2, style: 2, label: "Defend", custom_id: `adv:defend:${userId}` },
        { type: 2, style: 2, label: "Item", custom_id: `adv:items:${userId}`, disabled: !hasItems },
      ],
    },
  ];

  if (hasSkills) {
    const skillButtons = unlockedSkills.slice(0, 5).map((s) => ({
      type: 2, style: 1, label: s.name,
      custom_id: `adv:useskill:${userId}:${s.effect}`,
    }));
    components.push({ type: 1, components: skillButtons });
  }

  return components;
}

export function buildItemPickerComponents(
  userId: string,
  items: { itemId: ConsumableItemId; quantity: number }[],
): any[] {
  const buttons: any[] = items.slice(0, 4).map((slot) => {
    const def = getConsumableItem(slot.itemId);
    const label = def ? `${def.name} x${slot.quantity}` : `${slot.itemId} x${slot.quantity}`;
    return {
      type: 2, style: 1, label,
      custom_id: `adv:useitem:${userId}:${slot.itemId}`,
    };
  });
  buttons.push({ type: 2, style: 2, label: "Back", custom_id: `adv:back:${userId}` });

  return [{ type: 1, components: buttons }];
}
