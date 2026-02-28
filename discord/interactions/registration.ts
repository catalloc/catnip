/**
 * discord/interactions/registration.ts
 *
 * Unified command registration, deregistration, and sync operations.
 * This module is the SINGLE SOURCE OF TRUTH for all Discord command management.
 */

import { getCommand, getAllCommands } from "./registry.ts";
import { SERVERS, type ServerKey, type RegistrationScope, type Command } from "./define-command.ts";
import { discordBotFetch, commandsPath } from "../discord-api.ts";
import { CONFIG } from "../constants.ts";

const DEFAULT_REGISTRATION: RegistrationScope = {
  type: "guild",
  servers: ["MAIN"],
};

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

function resolveGuildIds(
  registration: RegistrationScope | undefined,
): (string | undefined)[] {
  const reg = registration || DEFAULT_REGISTRATION;

  switch (reg.type) {
    case "global":
      return [undefined];
    case "guild":
      return reg.servers.map((server) => SERVERS[server]).filter((id) => !!id);
    case "all-guilds":
      return Object.values(SERVERS).filter((id) => !!id);
  }
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

export async function registerCommand(
  commandName: string,
): Promise<RegistrationResult[]> {
  const results: RegistrationResult[] = [];

  try {
    const commandDef = getCommand(commandName);
    if (!commandDef) {
      throw new Error(`Command not found in registry: ${commandName}`);
    }

    const guildIds = resolveGuildIds(commandDef.registration);

    if (guildIds.length === 0) {
      throw new Error(`No valid guild IDs resolved for command: ${commandName}`);
    }

    for (const guildId of guildIds) {
      const payload = commandPayload(commandDef);
      const result = await discordBotFetch("POST", commandsPath(CONFIG.appId, guildId), payload);

      results.push({
        command: commandName,
        success: result.ok,
        commandId: result.data?.id,
        error: result.error,
        guildId: guildId || "global",
      });

      await new Promise((r) => setTimeout(r, 100));
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
 * Register all commands from registry using bulk overwrite per guild
 */
export async function registerAllCommandsFromRegistry(): Promise<
  RegistrationResult[]
> {
  const allResults: RegistrationResult[] = [];
  const byGuild = new Map<string | undefined, Record<string, any>[]>();

  for (const cmd of getAllCommands()) {
    const guildIds = resolveGuildIds(cmd.registration);
    const payload = commandPayload(cmd);
    for (const guildId of guildIds) {
      if (!byGuild.has(guildId)) byGuild.set(guildId, []);
      byGuild.get(guildId)!.push(payload);
    }
  }

  for (const [guildId, commands] of byGuild) {
    const result = await bulkOverwriteCommands(commands, CONFIG.appId, guildId);
    for (const cmd of commands) {
      allResults.push({
        command: cmd.name,
        success: result.success,
        error: result.error,
        guildId: guildId || "global",
      });
    }
  }

  return allResults;
}

/**
 * Register commands to a specific server only.
 * Uses bulk overwrite when registering all; sequential POST for a subset.
 */
export async function registerCommandsToServer(
  serverKey: ServerKey,
  commandNames?: string[],
): Promise<RegistrationResult[]> {
  const guildId = SERVERS[serverKey];
  if (!guildId) {
    throw new Error(`No guild ID found for server: ${serverKey}`);
  }

  const serverCommands = getAllCommands()
    .filter((cmd) => {
      const reg = cmd.registration || DEFAULT_REGISTRATION;
      if (reg.type === "all-guilds") return true;
      if (reg.type === "guild") return reg.servers.includes(serverKey);
      return false;
    })
    .map((cmd) => cmd.name);

  const toRegister = commandNames
    ? commandNames.filter((n) => serverCommands.includes(n))
    : serverCommands;

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

export async function deregisterCommandFromServer(
  commandName: string,
  serverKey: ServerKey,
): Promise<DeregistrationResult> {
  const guildId = SERVERS[serverKey];
  if (!guildId) {
    return {
      command: commandName,
      success: false,
      guildId: serverKey,
      error: `No guild ID found for server: ${serverKey}`,
    };
  }

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
 * Deregister ALL commands from a specific server
 * Uses bulk overwrite with empty array (most efficient)
 */
export async function deregisterAllFromServer(
  serverKey: ServerKey,
): Promise<{ success: boolean; error?: string }> {
  const guildId = SERVERS[serverKey];
  if (!guildId) {
    return { success: false, error: `No guild ID for ${serverKey}` };
  }

  try {
    return await bulkOverwriteCommands([], CONFIG.appId, guildId);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
