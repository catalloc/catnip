/**
 * discord/linked-roles/oauth.ts
 *
 * Discord OAuth2 helpers for the Linked Roles flow.
 * These use user Bearer tokens (not Bot tokens), so they are
 * intentionally separate from discordBotFetch.
 */

import { CONFIG } from "../constants.ts";
import type { LinkedRolesUser, VerifyResult } from "./define-verifier.ts";

const API_BASE = "https://discord.com/api/v10";

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

/** Exchange an authorization code for tokens. */
export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: CONFIG.appId,
    client_secret: CONFIG.clientSecret,
  });

  const res = await fetch(`${API_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }
  return res.json();
}

/** Fetch the authenticated user's profile. */
export async function fetchUser(
  accessToken: string,
): Promise<LinkedRolesUser> {
  const res = await fetch(`${API_BASE}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fetch user failed (${res.status}): ${text}`);
  }
  return res.json();
}

/** A connected account on the user's Discord profile. */
export interface DiscordConnection {
  type: string;
  id: string;
  name: string;
  verified: boolean;
  visibility: number;
}

/** Fetch the authenticated user's connected accounts. */
export async function fetchConnections(
  accessToken: string,
): Promise<DiscordConnection[]> {
  const res = await fetch(`${API_BASE}/users/@me/connections`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fetch connections failed (${res.status}): ${text}`);
  }
  return res.json();
}

/** Push role connection metadata for the authenticated user. */
export async function pushMetadata(
  accessToken: string,
  result: VerifyResult,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/users/@me/applications/${CONFIG.appId}/role-connection`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        platform_name: result.platformName,
        platform_username: result.platformUsername,
        metadata: result.metadata,
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Push metadata failed (${res.status}): ${text}`);
  }
}
