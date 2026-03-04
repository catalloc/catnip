/**
 * Shop Command — Browse and buy items, admin: add/remove items
 *
 * File: discord/interactions/commands/shop.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { shop } from "../../economy/shop.ts";
import { economyConfig } from "../../economy/economy-config.ts";
import { embed } from "../../helpers/embed-builder.ts";
import { EmbedColors, isGuildAdmin } from "../../constants.ts";
import type { ShopItemType, JobTierId } from "../../economy/types.ts";

export default defineCommand({
  name: "shop",
  description: "Browse and buy items from the server shop",

  options: [
    {
      name: "browse",
      description: "View available items",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
    {
      name: "buy",
      description: "Purchase an item",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "item", description: "Item number from /shop browse", type: OptionTypes.INTEGER, required: true },
      ],
    },
    {
      name: "add",
      description: "Add an item to the shop (admin)",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "name", description: "Item name", type: OptionTypes.STRING, required: true },
        { name: "price", description: "Price in coins", type: OptionTypes.INTEGER, required: true },
        { name: "description", description: "Item description", type: OptionTypes.STRING, required: true },
        {
          name: "type", description: "Item type", type: OptionTypes.STRING, required: true,
          choices: [
            { name: "Job Upgrade", value: "job-upgrade" },
            { name: "Cosmetic Role", value: "cosmetic-role" },
            { name: "Custom", value: "custom" },
          ],
        },
        { name: "job-tier", description: "Job tier to unlock (for job-upgrade type)", type: OptionTypes.STRING, required: false },
        { name: "role", description: "Role to grant (for cosmetic-role type)", type: OptionTypes.ROLE, required: false },
      ],
    },
    {
      name: "remove",
      description: "Remove an item from the shop (admin)",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "item", description: "Item number from /shop browse", type: OptionTypes.INTEGER, required: true },
      ],
    },
  ],

  registration: { type: "guild" },
  deferred: false,
  ephemeral: true,

  async execute({ guildId, userId, options, memberRoles, memberPermissions }) {
    const sub = options?.subcommand as string | undefined;
    const config = await economyConfig.get(guildId);

    if (sub === "browse") {
      const items = await shop.getEnabledItems(guildId);
      if (items.length === 0) {
        return { success: true, message: "The shop is empty! An admin can add items with `/shop add`." };
      }

      const lines = items.map((item, i) => {
        const extra = item.type === "job-upgrade" ? ` (unlocks **${item.unlocksJobTier}**)` : "";
        return `**${i + 1}.** ${item.name} — **${item.price.toLocaleString()}** ${config.currencyName}${extra}\n> ${item.description}`;
      });

      const e = embed()
        .title(`${config.currencyEmoji} Shop`)
        .description(lines.join("\n\n"))
        .color(EmbedColors.INFO)
        .footer("Use /shop buy <number> to purchase")
        .build();

      return { success: true, embed: e };
    }

    if (sub === "buy") {
      const itemNum = options?.item as number;
      const items = await shop.getEnabledItems(guildId);

      if (itemNum < 1 || itemNum > items.length) {
        return { success: false, error: `Invalid item number. Use 1-${items.length}.` };
      }

      const item = items[itemNum - 1];
      const result = await shop.buyItem(guildId, userId, item.id);

      if (!result.success) {
        return { success: false, error: result.error };
      }

      return {
        success: true,
        message: `${config.currencyEmoji} Purchased **${result.item!.name}** for **${result.item!.price.toLocaleString()} ${config.currencyName}**!`,
      };
    }

    if (sub === "add") {
      const isAdmin = await isGuildAdmin(guildId, userId, memberRoles ?? [], memberPermissions);
      if (!isAdmin) return { success: false, error: "Only admins can add shop items." };

      const name = options?.name as string;
      const price = options?.price as number;
      const description = options?.description as string;
      const type = options?.type as ShopItemType;
      const jobTier = options?.["job-tier"] as JobTierId | undefined;
      const roleId = options?.role as string | undefined;

      if (price < 1) return { success: false, error: "Price must be at least 1." };

      const result = await shop.addItem(guildId, {
        name, price, description, type,
        unlocksJobTier: jobTier,
        roleId,
      });

      if (!result.success) return { success: false, error: result.error };

      return {
        success: true,
        message: `Added **${name}** to the shop for **${price.toLocaleString()} ${config.currencyName}**.`,
      };
    }

    if (sub === "remove") {
      const isAdmin = await isGuildAdmin(guildId, userId, memberRoles ?? [], memberPermissions);
      if (!isAdmin) return { success: false, error: "Only admins can remove shop items." };

      const itemNum = options?.item as number;
      const catalog = await shop.getCatalog(guildId);

      if (itemNum < 1 || itemNum > catalog.items.length) {
        return { success: false, error: `Invalid item number. Use 1-${catalog.items.length}.` };
      }

      const item = catalog.items[itemNum - 1];
      const removed = await shop.removeItem(guildId, item.id);

      if (!removed) return { success: false, error: "Failed to remove item." };

      return { success: true, message: `Removed **${item.name}** from the shop.` };
    }

    return { success: false, error: "Please use a subcommand: browse, buy, add, or remove." };
  },
});
