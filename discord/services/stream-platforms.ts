/**
 * discord/services/stream-platforms.ts
 *
 * Platform adapters for checking live stream status on Twitch, YouTube, and Kick.
 * Twitch uses batched Helix API calls with in-memory token caching.
 * YouTube uses the Data API v3 search endpoint.
 * Kick uses the unofficial public API (best-effort).
 */

import { CONFIG } from "../constants.ts";

export type Platform = "twitch" | "youtube" | "kick";

export interface StreamStatus {
  isLive: boolean;
  title?: string;
  viewerCount?: number;
  thumbnailUrl?: string;
  streamUrl: string;
}

// --- Twitch ---

interface TwitchTokenCache {
  accessToken: string;
  expiresAt: number; // epoch ms
}

let memoryTokenCache: TwitchTokenCache | null = null;

async function getTwitchToken(): Promise<string> {
  const clientId = CONFIG.twitchClientId;
  const clientSecret = CONFIG.twitchClientSecret;
  if (!clientId || !clientSecret) {
    throw new Error("TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET are required for Twitch streams");
  }

  if (memoryTokenCache && memoryTokenCache.expiresAt > Date.now() + 60_000) {
    return memoryTokenCache.accessToken;
  }

  const resp = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Twitch token request failed (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  memoryTokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return memoryTokenCache.accessToken;
}

/**
 * Check live status for up to 100 Twitch usernames in one API call.
 * Returns a map of lowercase username -> StreamStatus.
 */
export async function checkTwitchStreams(usernames: string[]): Promise<Map<string, StreamStatus>> {
  const results = new Map<string, StreamStatus>();
  if (usernames.length === 0) return results;

  const clientId = CONFIG.twitchClientId;
  if (!clientId) throw new Error("TWITCH_CLIENT_ID is required for Twitch streams");

  const token = await getTwitchToken();

  // Batch up to 100 per request
  const batches: string[][] = [];
  for (let i = 0; i < usernames.length; i += 100) {
    batches.push(usernames.slice(i, i + 100));
  }

  for (const batch of batches) {
    const params = new URLSearchParams();
    for (const u of batch) params.append("user_login", u.toLowerCase());

    const resp = await fetch(`https://api.twitch.tv/helix/streams?${params}`, {
      headers: {
        "Client-ID": clientId,
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Twitch streams API failed (${resp.status}): ${text}`);
    }

    const data = await resp.json();
    const liveSet = new Set<string>();

    for (const stream of data.data ?? []) {
      const login = (stream.user_login as string).toLowerCase();
      liveSet.add(login);
      results.set(login, {
        isLive: true,
        title: stream.title,
        viewerCount: stream.viewer_count,
        thumbnailUrl: (stream.thumbnail_url as string)
          ?.replace("{width}", "440")
          .replace("{height}", "248"),
        streamUrl: `https://twitch.tv/${login}`,
      });
    }

    // Mark non-live usernames as offline
    for (const u of batch) {
      const lower = u.toLowerCase();
      if (!liveSet.has(lower)) {
        results.set(lower, { isLive: false, streamUrl: `https://twitch.tv/${lower}` });
      }
    }
  }

  return results;
}

// --- YouTube ---

/**
 * Check if a YouTube channel is currently live streaming.
 * Uses 100 quota units per call.
 */
export async function checkYouTubeStream(channelId: string): Promise<StreamStatus> {
  const apiKey = CONFIG.youtubeApiKey;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY is required for YouTube streams");

  const params = new URLSearchParams({
    part: "snippet",
    channelId,
    eventType: "live",
    type: "video",
    maxResults: "1",
    key: apiKey,
  });

  const resp = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`YouTube API failed (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  const items = data.items ?? [];

  if (items.length === 0) {
    return { isLive: false, streamUrl: `https://youtube.com/channel/${channelId}` };
  }

  const item = items[0];
  const videoId = item.id?.videoId;
  return {
    isLive: true,
    title: item.snippet?.title,
    thumbnailUrl: item.snippet?.thumbnails?.high?.url,
    streamUrl: videoId
      ? `https://youtube.com/watch?v=${videoId}`
      : `https://youtube.com/channel/${channelId}`,
  };
}

// --- Kick ---

/**
 * Check if a Kick streamer is live using the unofficial public API.
 * No API key required. Best-effort — may break if Kick changes their API.
 */
export async function checkKickStream(username: string): Promise<StreamStatus> {
  const resp = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(username)}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) {
    if (resp.status === 404) {
      return { isLive: false, streamUrl: `https://kick.com/${username}` };
    }
    const text = await resp.text();
    throw new Error(`Kick API failed (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  const livestream = data.livestream;

  if (!livestream || !livestream.is_live) {
    return { isLive: false, streamUrl: `https://kick.com/${username}` };
  }

  return {
    isLive: true,
    title: livestream.session_title ?? livestream.slug,
    viewerCount: livestream.viewer_count,
    thumbnailUrl: livestream.thumbnail?.url,
    streamUrl: `https://kick.com/${username}`,
  };
}
