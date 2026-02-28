/**
 * discord/linked-roles/verifiers/steam.ts
 *
 * Verifier: Steam Profile
 * Pattern: Discord connections + Steam Web API key.
 * Requires the `connections` OAuth scope and a STEAM_API_KEY env var.
 */

import {
  defineVerifier,
  MetadataType,
} from "../define-verifier.ts";
import { setVerifier } from "../routes.ts";
import { fetchConnections } from "../oauth.ts";
import { CONFIG } from "../../constants.ts";

const STEAM_API = "https://api.steampowered.com";

interface SteamPlayer {
  timecreated?: number;
}

interface SteamOwnedGames {
  game_count?: number;
}

async function fetchSteamPlayer(steamId: string): Promise<SteamPlayer> {
  const url = new URL(`${STEAM_API}/ISteamUser/GetPlayerSummaries/v2/`);
  url.searchParams.set("key", CONFIG.steamApiKey);
  url.searchParams.set("steamids", steamId);

  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Steam API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const players = data?.response?.players;
  return players?.[0] ?? {};
}

async function fetchOwnedGames(steamId: string): Promise<SteamOwnedGames> {
  const url = new URL(`${STEAM_API}/IPlayerService/GetOwnedGames/v1/`);
  url.searchParams.set("key", CONFIG.steamApiKey);
  url.searchParams.set("steamid", steamId);

  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Steam API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data?.response ?? {};
}

const steam = defineVerifier({
  name: "Steam",

  scopes: ["connections"],

  metadata: [
    {
      key: "games_owned",
      name: "Games Owned",
      description: "Number of games owned on Steam",
      type: MetadataType.INTEGER_GREATER_THAN_OR_EQUAL,
    },
    {
      key: "account_age_days",
      name: "Steam Account Age (days)",
      description: "Number of days since the Steam account was created",
      type: MetadataType.INTEGER_GREATER_THAN_OR_EQUAL,
    },
  ],

  async verify(user, accessToken) {
    if (!CONFIG.steamApiKey) {
      throw new Error("STEAM_API_KEY is not configured.");
    }

    const connections = await fetchConnections(accessToken);
    const steamConn = connections.find((c) => c.type === "steam");

    if (!steamConn) {
      throw new Error(
        "No Steam account linked to your Discord profile. " +
        "Go to Discord Settings → Connections → Add Steam, then try again.",
      );
    }

    const steamId = steamConn.id;
    const [player, games] = await Promise.all([
      fetchSteamPlayer(steamId),
      fetchOwnedGames(steamId),
    ]);

    // Private profiles may not expose timecreated or game count — default to 0
    const ageDays = player.timecreated
      ? Math.floor((Date.now() / 1000 - player.timecreated) / (60 * 60 * 24))
      : 0;

    return {
      platformName: "Steam",
      platformUsername: steamConn.name,
      metadata: {
        games_owned: games.game_count ?? 0,
        account_age_days: ageDays,
      },
    };
  },
});

setVerifier(steam);
