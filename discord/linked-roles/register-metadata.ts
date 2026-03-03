/**
 * discord/linked-roles/register-metadata.ts
 *
 * Pushes the active verifier's metadata schema to Discord.
 * Uses the bot token (discordBotFetch), not user OAuth.
 */

import { CONFIG } from "../constants.ts";
import { discordBotFetch } from "../discord-api.ts";
import { getVerifier } from "./routes.ts";

/**
 * Register the active verifier's metadata schema with Discord.
 * PUT /applications/{app_id}/role-connections/metadata
 */
export async function registerMetadataSchema(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const verifier = getVerifier();
  if (!verifier) {
    return { ok: false, error: "No verifier configured" };
  }

  const schema = verifier.metadata.map((field) => ({
    key: field.key,
    name: field.name,
    description: field.description,
    type: field.type,
  }));

  const result = await discordBotFetch(
    "PUT",
    `applications/${CONFIG.appId}/role-connections/metadata`,
    schema,
  );

  if (!result.ok) {
    return { ok: false, error: result.error ?? `HTTP ${result.status}` };
  }
  return { ok: true };
}
