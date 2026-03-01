/**
 * discord/interactions/registration.ts
 *
 * Unified command registration, deregistration, and sync operations.
 * Supports global commands (always available) and per-guild commands
 * (managed by guild admins via /server commands enable/disable).
 */

import { getCommand, getAllCommands } from "./registry.ts";
import type { Command } from "./define-command.ts";
import { discordBotFetch, commandsPath } from "../discord-api.ts";
import { CONFIG } from "../constants.ts";
import { guildConfig } from "../persistence/guild-config.ts";

export interface RegistrationResult {
  command: string;
  success: boolean;
  commandId?: string;
  error?: string;
  guildId?: string;
}

export interface DeregistrationResult {
  command: string;
  success: boolean;
  guildId: string;
  error?: string;
}

function commandPayload(cmd: Command): Record<string, any> {
  // Context menu commands (type 2/3) don't use description or options
  if (cmd.type && cmd.type !== 1) {
    return { name: cmd.name, type: cmd.type };
  }
  const p: Record<string, any> = { name: cmd.name, description: cmd.description };
  if (cmd.options) p.options = cmd.options;
  return p;
}

async function deleteCommandById(
  commandId: string,
  appId: string,
  guildId?: string,
): Promise<{ success: boolean; error?: string }> {
  const result = await discordBotFetch("DELETE", commandsPath(appId, guildId, commandId));
  return { success: result.ok, error: result.error };
}

async function bulkOverwriteCommands(
  commands: Record<string, any>[],
  appId: string,
  guildId?: string,
): Promise<{ success: boolean; error?: string }> {
  const result = await discordBotFetch("PUT", commandsPath(appId, guildId), commands);
  return { success: result.ok, error: result.error };
}

export async function fetchRegisteredCommands(
  guildId?: string,
): Promise<Array<{ id: string; name: string; description: string }>> {
  const result = await discordBotFetch("GET", commandsPath(CONFIG.appId, guildId));
  if (!result.ok) {
    throw new Error(`Failed to fetch commands: ${result.error}`);
  }
  return result.data;
}

/** Get all commands with registration type "global" */
export function getGlobalCommands(): Command[] {
  return getAllCommands().filter((cmd) => cmd.registration.type === "global");
}

/** Get all commands with registration type "guild" (per-guild, managed by admins) */
export function getGuildRegistrableCommands(): Command[] {
  return getAllCommands().filter((cmd) => cmd.registration.type === "guild");
}

/** Register only global commands (server, commands, ping, help) */
export async function registerGlobalCommands(): Promise<RegistrationResult[]> {
  const globalCmds = getGlobalCommands();
  if (globalCmds.length === 0) return [];

  const payloads = globalCmds.map(commandPayload);
  const result = await bulkOverwriteCommands(payloads, CONFIG.appId);

  return payloads.map((p) => ({
    command: p.name,
    success: result.success,
    error: result.error,
    guildId: "global",
  }));
}

/**
 * Register a single command. Global commands register globally;
 * guild commands register to all configured guilds that have them enabled.
 */
export async function registerCommand(
  commandName: string,
): Promise<RegistrationResult[]> {
  const results: RegistrationResult[] = [];

  try {
    const commandDef = getCommand(commandName);
    if (!commandDef) {
      throw new Error(`Command not found in registry: ${commandName}`);
    }

    if (commandDef.registration.type === "global") {
      const payload = commandPayload(commandDef);
      const result = await discordBotFetch("POST", commandsPath(CONFIG.appId), payload);
      results.push({
        command: commandName,
        success: result.ok,
        commandId: result.data?.id,
        error: result.error,
        guildId: "global",
      });
    } else {
      // Guild command — register to all guilds that have it enabled
      const guilds = await guildConfig.listGuilds();
      for (const guild of guilds) {
        if (guild.enabledCommands.includes(commandName)) {
          const payload = commandPayload(commandDef);
          const result = await discordBotFetch(
            "POST",
            commandsPath(CONFIG.appId, guild.guildId),
            payload,
          );
          results.push({
            command: commandName,
            success: result.ok,
            commandId: result.data?.id,
            error: result.error,
            guildId: guild.guildId,
          });
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      if (results.length === 0) {
        results.push({
          command: commandName,
          success: true,
          guildId: "none",
        });
      }
    }

    return results;
  } catch (error) {
    return [
      {
        command: commandName,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
    ];
  }
}

/**
 * Register all commands: global commands globally, then for each
 * configured guild register their enabled commands.
 */
export async function registerAllCommandsFromRegistry(): Promise<
  RegistrationResult[]
> {
  const allResults: RegistrationResult[] = [];

  // 1. Register global commands
  const globalResults = await registerGlobalCommands();
  allResults.push(...globalResults);

  // 2. For each configured guild, register their enabled commands
  const guilds = await guildConfig.listGuilds();
  for (const guild of guilds) {
    if (guild.enabledCommands.length === 0) continue;
    const guildResults = await registerCommandsToGuild(
      guild.guildId,
      guild.enabledCommands,
    );
    allResults.push(...guildResults);
  }

  return allResults;
}

/**
 * Register commands to a specific guild.
 * Uses bulk overwrite when no subset specified; sequential POST for a subset.
 */
export async function registerCommandsToGuild(
  guildId: string,
  commandNames?: string[],
): Promise<RegistrationResult[]> {
  const guildCommands = getGuildRegistrableCommands().map((cmd) => cmd.name);

  const toRegister = commandNames
    ? commandNames.filter((n) => guildCommands.includes(n))
    : guildCommands;

  const payloads: Record<string, any>[] = [];
  for (const cmdName of toRegister) {
    const commandDef = getCommand(cmdName);
    if (!commandDef) continue;
    payloads.push(commandPayload(commandDef));
  }

  // Bulk overwrite when no subset specified; sequential POST for subset
  if (!commandNames) {
    const result = await bulkOverwriteCommands(payloads, CONFIG.appId, guildId);
    return payloads.map((p) => ({
      command: p.name,
      success: result.success,
      error: result.error,
      guildId,
    }));
  }

  const results: RegistrationResult[] = [];
  for (const payload of payloads) {
    const result = await discordBotFetch("POST", commandsPath(CONFIG.appId, guildId), payload);
    results.push({
      command: payload.name,
      success: result.ok,
      commandId: result.data?.id,
      error: result.error,
      guildId,
    });
    await new Promise((r) => setTimeout(r, 100));
  }
  return results;
}

export async function deregisterCommandFromGuild(
  commandName: string,
  guildId: string,
): Promise<DeregistrationResult> {
  try {
    const commands = await fetchRegisteredCommands(guildId);
    const existing = commands.find((c) => c.name === commandName);

    if (!existing) {
      return { command: commandName, success: true, guildId };
    }

    const result = await deleteCommandById(existing.id, CONFIG.appId, guildId);

    if (result.success) {
      return { command: commandName, success: true, guildId };
    }
    return {
      command: commandName,
      success: result.success,
      guildId,
      error: result.error,
    };
  } catch (error) {
    return {
      command: commandName,
      success: false,
      guildId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Deregister ALL commands from a specific guild.
 * Uses bulk overwrite with empty array (most efficient).
 */
export async function deregisterAllFromGuild(
  guildId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    return await bulkOverwriteCommands([], CONFIG.appId, guildId);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
