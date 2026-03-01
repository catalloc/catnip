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

  const requestBody = body !== undefined ? JSON.stringify(body) : undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(`https://discord.com/api/v10/${path}`, {
        method,
        headers,
        body: requestBody,
        signal: AbortSignal.timeout(30_000),
      });

      if (response.ok) {
        if (response.status === 204) {
          return { ok: true, status: 204 };
        }
        const data = await response.json();
        return { ok: true, status: response.status, data };
      }

      // 429 Rate Limited — parse Retry-After, wait (capped at 10s), retry once
      if (response.status === 429 && attempt === 0) {
        const retryAfter = response.headers.get("Retry-After");
        const waitMs = retryAfter
          ? Math.min(Math.ceil(parseFloat(retryAfter) * 1000), 10_000)
          : 1000;
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      // 5xx Server Error — wait 1s, retry once
      if (response.status >= 500 && attempt === 0) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      const errorText = await response.text();
      return { ok: false, status: response.status, error: `${response.status}: ${errorText}` };
    } catch (error) {
      // Network error — wait 1s, retry once
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      return {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return { ok: false, status: 0, error: "Max retries exceeded" };
}
