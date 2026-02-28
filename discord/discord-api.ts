/**
 * discord/discord-api.ts
 *
 * Shared helper for Discord Bot API calls.
 * Centralizes URL construction, Bot auth headers, and error handling.
 */

import { CONFIG } from "./constants.ts";

export interface DiscordApiResult {
  ok: boolean;
  status: number;
  data?: any;
  error?: string;
}

/**
 * Make an authenticated request to the Discord Bot API.
 * Builds the full URL, attaches Bot token, and handles response parsing.
 */
/**
 * Build the Discord API path for application commands.
 */
export function commandsPath(appId: string, guildId?: string, commandId?: string): string {
  let path = guildId
    ? `applications/${appId}/guilds/${guildId}/commands`
    : `applications/${appId}/commands`;
  if (commandId) path += `/${commandId}`;
  return path;
}

export async function discordBotFetch(
  method: string,
  path: string,
  body?: unknown,
): Promise<DiscordApiResult> {
  const headers: Record<string, string> = {
    Authorization: `Bot ${CONFIG.botToken}`,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`https://discord.com/api/v10/${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { ok: false, status: response.status, error: `${response.status}: ${errorText}` };
  }

  // DELETE returns 204 with no body
  if (response.status === 204) {
    return { ok: true, status: 204 };
  }

  const data = await response.json();
  return { ok: true, status: response.status, data };
}
