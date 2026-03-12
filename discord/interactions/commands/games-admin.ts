/**
 * Games Config Command — Admin configuration for the games system
 *
 * File: discord/interactions/commands/games-admin.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { gamesConfig } from "../../games/games-config.ts";
import { ALL_GAME_NAMES } from "../../games/types.ts";
import { embed } from "../../helpers/embed-builder.ts";
import { EmbedColors } from "../../constants.ts";

export default defineCommand({
  name: "games-config",
  description: "Configure the server games system (admin only)",

  options: [
    {
      name: "info",
      description: "View current games settings",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
    {
      name: "setup",
      description: "Configure currency settings",
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
      name: "toggle",
      description: "Enable or disable a specific game",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "game", description: "Game to toggle", type: OptionTypes.STRING, required: true,
          choices: ALL_GAME_NAMES.map((g) => ({ name: g, value: g })),
        },
        { name: "enabled", description: "Enable or disable this game", type: OptionTypes.BOOLEAN, required: true },
      ],
    },
    {
      name: "daily",
      description: "Configure daily reward settings",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "enabled", description: "Enable or disable the daily reward", type: OptionTypes.BOOLEAN, required: false },
        { name: "min", description: "Minimum daily reward", type: OptionTypes.INTEGER, required: false },
        { name: "max", description: "Maximum daily reward", type: OptionTypes.INTEGER, required: false },
      ],
    },
    {
      name: "reset",
      description: "Reset all games settings to defaults",
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
      const config = await gamesConfig.get(guildId);
      const disabled = config.disabledGames ?? [];
      const e = embed()
        .title(`${config.currencyEmoji} Games Settings`)
        .color(EmbedColors.INFO)
        .field("Currency", `${config.currencyName} ${config.currencyEmoji}`, true)
        .field("Starting Balance", `${config.startingBalance.toLocaleString()}`, true)
        .field("Casino", config.casinoEnabled ? `Enabled (${config.casinoMinBet}-${config.casinoMaxBet.toLocaleString()})` : "Disabled", true)
        .field("Daily Reward", config.dailyEnabled !== false ? `${config.dailyMin ?? 50}-${config.dailyMax ?? 150}` : "Disabled", true)
        .field("Disabled Games", disabled.length > 0 ? disabled.join(", ") : "None", false)
        .build();

      return { success: true, embed: e };
    }

    if (sub === "setup") {
      const changes: Record<string, any> = {};
      if (options?.["currency-name"] != null) {
        const name = String(options["currency-name"]).replace(/[`\\*_~|<>]/g, "").trim();
        if (name.length === 0) return { success: false, error: "Currency name cannot be empty." };
        if (name.length > 32) return { success: false, error: "Currency name must be 32 characters or fewer." };
        changes.currencyName = name;
      }
      if (options?.["currency-emoji"] != null) {
        const emoji = String(options["currency-emoji"]).trim();
        if (emoji.length === 0) return { success: false, error: "Currency emoji cannot be empty." };
        if (emoji.length > 64) return { success: false, error: "Currency emoji must be 64 characters or fewer." };
        changes.currencyEmoji = emoji;
      }
      if (options?.["starting-balance"] != null) {
        if (options["starting-balance"] < 0) return { success: false, error: "Starting balance cannot be negative." };
        changes.startingBalance = options["starting-balance"];
      }

      if (Object.keys(changes).length === 0) {
        return { success: false, error: "Provide at least one setting to change." };
      }

      await gamesConfig.update(guildId, changes);
      return { success: true, message: `Games settings updated: ${Object.keys(changes).join(", ")}.` };
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

      // Validate min-bet <= max-bet relationship
      if (changes.casinoMinBet != null || changes.casinoMaxBet != null) {
        const current = await gamesConfig.get(guildId);
        const effectiveMin = changes.casinoMinBet ?? current.casinoMinBet;
        const effectiveMax = changes.casinoMaxBet ?? current.casinoMaxBet;
        if (effectiveMin > effectiveMax) {
          return { success: false, error: `Minimum bet (${effectiveMin}) cannot exceed maximum bet (${effectiveMax}).` };
        }
      }

      await gamesConfig.update(guildId, changes);
      return { success: true, message: `Casino settings updated: ${Object.keys(changes).join(", ")}.` };
    }

    if (sub === "toggle") {
      const game = options?.game as string;
      const enabled = options?.enabled as boolean;

      if (!ALL_GAME_NAMES.includes(game as any)) {
        return { success: false, error: `Unknown game: ${game}.` };
      }

      const config = await gamesConfig.get(guildId);
      const disabled = new Set(config.disabledGames ?? []);

      if (enabled) {
        disabled.delete(game);
      } else {
        disabled.add(game);
      }

      await gamesConfig.update(guildId, { disabledGames: [...disabled] });
      return { success: true, message: `**${game}** is now ${enabled ? "enabled" : "disabled"}.` };
    }

    if (sub === "daily") {
      const changes: Record<string, any> = {};
      if (options?.enabled != null) changes.dailyEnabled = options.enabled;
      if (options?.min != null) {
        if (options.min < 0) return { success: false, error: "Minimum reward cannot be negative." };
        changes.dailyMin = options.min;
      }
      if (options?.max != null) {
        if (options.max < 1) return { success: false, error: "Maximum reward must be at least 1." };
        changes.dailyMax = options.max;
      }

      if (Object.keys(changes).length === 0) {
        return { success: false, error: "Provide at least one setting to change." };
      }

      // Validate min <= max relationship
      if (changes.dailyMin != null || changes.dailyMax != null) {
        const current = await gamesConfig.get(guildId);
        const effectiveMin = changes.dailyMin ?? current.dailyMin ?? 50;
        const effectiveMax = changes.dailyMax ?? current.dailyMax ?? 150;
        if (effectiveMin > effectiveMax) {
          return { success: false, error: `Minimum reward (${effectiveMin}) cannot exceed maximum reward (${effectiveMax}).` };
        }
      }

      await gamesConfig.update(guildId, changes);
      return { success: true, message: `Daily reward settings updated: ${Object.keys(changes).join(", ")}.` };
    }

    if (sub === "reset") {
      await gamesConfig.reset(guildId);
      return { success: true, message: "All games settings have been reset to defaults." };
    }

    return { success: false, error: "Please use a subcommand: info, setup, casino, toggle, daily, or reset." };
  },
});
