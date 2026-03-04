/**
 * Economy Command — Admin configuration for the economy system
 *
 * File: discord/interactions/commands/economy.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { economyConfig } from "../../economy/economy-config.ts";
import { embed } from "../../helpers/embed-builder.ts";
import { EmbedColors } from "../../constants.ts";

export default defineCommand({
  name: "economy",
  description: "Configure the server economy system (admin only)",

  options: [
    {
      name: "info",
      description: "View current economy settings",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
    {
      name: "setup",
      description: "Configure economy settings",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "currency-name", description: "Currency name (e.g., Coins, Gold)", type: OptionTypes.STRING, required: false },
        { name: "currency-emoji", description: "Currency emoji", type: OptionTypes.STRING, required: false },
        { name: "starting-balance", description: "Starting balance for new users", type: OptionTypes.INTEGER, required: false },
      ],
    },
    {
      name: "casino",
      description: "Configure casino settings",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "enabled", description: "Enable or disable the casino", type: OptionTypes.BOOLEAN, required: false,
        },
        { name: "min-bet", description: "Minimum bet", type: OptionTypes.INTEGER, required: false },
        { name: "max-bet", description: "Maximum bet", type: OptionTypes.INTEGER, required: false },
      ],
    },
    {
      name: "job",
      description: "Configure job settings",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "enabled", description: "Enable or disable jobs", type: OptionTypes.BOOLEAN, required: false },
      ],
    },
    {
      name: "crime",
      description: "Configure crime settings",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "enabled", description: "Enable or disable crime", type: OptionTypes.BOOLEAN, required: false },
        { name: "fines", description: "Enable or disable fines on failed crimes", type: OptionTypes.BOOLEAN, required: false },
      ],
    },
    {
      name: "farm",
      description: "Configure farm settings",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "enabled", description: "Enable or disable farming", type: OptionTypes.BOOLEAN, required: true },
      ],
    },
    {
      name: "mine",
      description: "Configure mine settings",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "enabled", description: "Enable or disable mining", type: OptionTypes.BOOLEAN, required: true },
      ],
    },
    {
      name: "forage",
      description: "Configure forage settings",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "enabled", description: "Enable or disable foraging", type: OptionTypes.BOOLEAN, required: true },
      ],
    },
    {
      name: "train",
      description: "Configure training settings",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "enabled", description: "Enable or disable training", type: OptionTypes.BOOLEAN, required: true },
      ],
    },
    {
      name: "arena",
      description: "Configure arena settings",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "enabled", description: "Enable or disable the arena", type: OptionTypes.BOOLEAN, required: true },
      ],
    },
    {
      name: "reset",
      description: "Reset all economy settings to defaults",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
  ],

  registration: { type: "guild" },
  deferred: false,
  ephemeral: true,
  adminOnly: true,

  async execute({ guildId, options }) {
    const sub = options?.subcommand as string | undefined;

    if (sub === "info") {
      const config = await economyConfig.get(guildId);
      const e = embed()
        .title(`${config.currencyEmoji} Economy Settings`)
        .color(EmbedColors.INFO)
        .field("Currency", `${config.currencyName} ${config.currencyEmoji}`, true)
        .field("Starting Balance", `${config.startingBalance.toLocaleString()}`, true)
        .field("Casino", config.casinoEnabled ? `Enabled (${config.casinoMinBet}-${config.casinoMaxBet.toLocaleString()})` : "Disabled", true)
        .field("Jobs", config.jobsEnabled ? "Enabled" : "Disabled", true)
        .field("Crime", config.crimeEnabled ? `Enabled${config.crimeFineEnabled ? " (fines on)" : " (fines off)"}` : "Disabled", true)
        .field("Farm", config.farmEnabled ? "Enabled" : "Disabled", true)
        .field("Mine", config.mineEnabled ? "Enabled" : "Disabled", true)
        .field("Forage", config.forageEnabled ? "Enabled" : "Disabled", true)
        .field("Training", config.trainEnabled ? "Enabled" : "Disabled", true)
        .field("Arena", config.arenaEnabled ? "Enabled" : "Disabled", true)
        .build();

      return { success: true, embed: e };
    }

    if (sub === "setup") {
      const changes: Record<string, any> = {};
      if (options?.["currency-name"] != null) changes.currencyName = options["currency-name"];
      if (options?.["currency-emoji"] != null) changes.currencyEmoji = options["currency-emoji"];
      if (options?.["starting-balance"] != null) {
        if (options["starting-balance"] < 0) return { success: false, error: "Starting balance cannot be negative." };
        changes.startingBalance = options["starting-balance"];
      }

      if (Object.keys(changes).length === 0) {
        return { success: false, error: "Provide at least one setting to change." };
      }

      await economyConfig.update(guildId, changes);
      return { success: true, message: `Economy settings updated: ${Object.keys(changes).join(", ")}.` };
    }

    if (sub === "casino") {
      const changes: Record<string, any> = {};
      if (options?.enabled != null) changes.casinoEnabled = options.enabled;
      if (options?.["min-bet"] != null) {
        if (options["min-bet"] < 1) return { success: false, error: "Minimum bet must be at least 1." };
        changes.casinoMinBet = options["min-bet"];
      }
      if (options?.["max-bet"] != null) {
        if (options["max-bet"] < 1) return { success: false, error: "Maximum bet must be at least 1." };
        changes.casinoMaxBet = options["max-bet"];
      }

      if (Object.keys(changes).length === 0) {
        return { success: false, error: "Provide at least one setting to change." };
      }

      await economyConfig.update(guildId, changes);
      return { success: true, message: `Casino settings updated: ${Object.keys(changes).join(", ")}.` };
    }

    if (sub === "job") {
      if (options?.enabled == null) {
        return { success: false, error: "Provide at least one setting to change." };
      }
      await economyConfig.update(guildId, { jobsEnabled: options.enabled });
      return { success: true, message: `Jobs ${options.enabled ? "enabled" : "disabled"}.` };
    }

    if (sub === "crime") {
      const changes: Record<string, any> = {};
      if (options?.enabled != null) changes.crimeEnabled = options.enabled;
      if (options?.fines != null) changes.crimeFineEnabled = options.fines;

      if (Object.keys(changes).length === 0) {
        return { success: false, error: "Provide at least one setting to change." };
      }

      await economyConfig.update(guildId, changes);
      return { success: true, message: `Crime settings updated: ${Object.keys(changes).join(", ")}.` };
    }

    if (sub === "farm") {
      await economyConfig.update(guildId, { farmEnabled: options?.enabled as boolean });
      return { success: true, message: `Farming ${options?.enabled ? "enabled" : "disabled"}.` };
    }

    if (sub === "mine") {
      await economyConfig.update(guildId, { mineEnabled: options?.enabled as boolean });
      return { success: true, message: `Mining ${options?.enabled ? "enabled" : "disabled"}.` };
    }

    if (sub === "forage") {
      await economyConfig.update(guildId, { forageEnabled: options?.enabled as boolean });
      return { success: true, message: `Foraging ${options?.enabled ? "enabled" : "disabled"}.` };
    }

    if (sub === "train") {
      await economyConfig.update(guildId, { trainEnabled: options?.enabled as boolean });
      return { success: true, message: `Training ${options?.enabled ? "enabled" : "disabled"}.` };
    }

    if (sub === "arena") {
      await economyConfig.update(guildId, { arenaEnabled: options?.enabled as boolean });
      return { success: true, message: `Arena ${options?.enabled ? "enabled" : "disabled"}.` };
    }

    if (sub === "reset") {
      await economyConfig.reset(guildId);
      return { success: true, message: "All economy settings have been reset to defaults." };
    }

    return { success: false, error: "Please use a subcommand: info, setup, casino, job, crime, or reset." };
  },
});
