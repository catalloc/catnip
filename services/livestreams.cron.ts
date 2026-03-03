/**
 * services/livestreams.cron.ts
 *
 * Cron job that polls streaming platforms and posts Discord embeds
 * when tracked streamers go live. Schedule in Val Town to run every 2-5 minutes.
 *
 * Algorithm:
 * 1. Load all stream trackers from KV
 * 2. Group by platform, check each (Twitch batched, YouTube/Kick parallel)
 * 3. Compare against stored live state — post notification on new live, clear on offline
 */

import { kv } from "../discord/persistence/kv.ts";
import {
  type StreamTracker,
  streamLiveKey,
} from "../discord/interactions/commands/livestream.ts";
import {
  type Platform,
  type StreamStatus,
  checkTwitchStreams,
  checkYouTubeStream,
  checkKickStream,
} from "../discord/services/stream-platforms.ts";
import { discordBotFetch } from "../discord/discord-api.ts";
import { createLogger, finalizeAllLoggers } from "../discord/webhook/logger.ts";
import { CONFIG } from "../discord/constants.ts";

const logger = createLogger("LivestreamCron");

const MAX_TRACKERS_PER_RUN = 200;
const CONCURRENCY = 5;

interface StreamLiveState {
  title: string;
  url: string;
  notifiedAt: string;
}

const PLATFORM_COLORS: Record<Platform, number> = {
  twitch: 0x9146ff,
  youtube: 0xff0000,
  kick: 0x53fc18,
};

const PLATFORM_LABELS: Record<Platform, string> = {
  twitch: "Twitch",
  youtube: "YouTube",
  kick: "Kick",
};

/** Run up to `limit` async tasks at a time. */
async function parallelMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      try {
        const value = await fn(items[i]);
        results[i] = { status: "fulfilled", value };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

const COOLDOWN_MS = 5 * 60 * 1000; // 5-minute renotification cooldown

async function processTracker(
  tracker: StreamTracker,
  status: StreamStatus,
): Promise<"notified" | "cleared" | "noop"> {
  const liveKey = streamLiveKey(tracker.guildId, tracker.platform, tracker.username);
  const cooldownKey = `stream_cooldown:${tracker.guildId}:${tracker.platform}:${tracker.username.toLowerCase()}`;

  if (status.isLive) {
    // Attempt atomic claim: only write if no live state exists yet
    let wonClaim = false;
    const liveState: StreamLiveState = {
      title: status.title || "",
      url: status.streamUrl,
      notifiedAt: new Date().toISOString(),
    };
    try {
      await kv.update<StreamLiveState | null>(liveKey, (current) => {
        if (current) return current; // already live — no-op (return existing)
        wonClaim = true;
        return liveState;
      });
    } catch {
      // CAS exhaustion — another cron instance is racing; skip this cycle
      return "noop";
    }

    if (!wonClaim) return "noop"; // already had live state

    // Check renotification cooldown
    const cooldown = await kv.get<{ clearedAt: number }>(cooldownKey);
    if (cooldown && Date.now() - cooldown.clearedAt < COOLDOWN_MS) {
      return "noop"; // within cooldown window — skip notification
    }

    // Post notification
    const embed = {
      author: {
        name: `${tracker.displayName} is now live!`,
        url: status.streamUrl,
      },
      title: status.title || "Live Stream",
      url: status.streamUrl,
      color: PLATFORM_COLORS[tracker.platform],
      footer: { text: PLATFORM_LABELS[tracker.platform] },
      timestamp: new Date().toISOString(),
      ...(status.thumbnailUrl ? { image: { url: status.thumbnailUrl } } : {}),
    };

    const result = await discordBotFetch("POST", `channels/${tracker.channelId}/messages`, {
      embeds: [embed],
    });

    if (!result.ok) {
      logger.error(`Failed to notify ${tracker.displayName} (${tracker.platform}) in guild ${tracker.guildId}: ${result.error}`);
      // Clean up the live state we just wrote since notification failed
      await kv.delete(liveKey);
      return "noop";
    }

    return "notified";
  } else {
    // Offline — clear live state if it existed
    const claimed = await kv.claimDelete(liveKey);
    if (claimed) {
      // Set cooldown so rapid online/offline cycles don't spam
      await kv.set(cooldownKey, { clearedAt: Date.now() }, Date.now() + COOLDOWN_MS);
      return "cleared";
    }
    return "noop";
  }
}

export default async function () {
  try {
    const entries = await kv.list("stream:", MAX_TRACKERS_PER_RUN);
    if (entries.length === 0) return;

    // Group trackers by platform
    const byPlatform: Record<Platform, StreamTracker[]> = {
      twitch: [],
      youtube: [],
      kick: [],
    };

    for (const entry of entries) {
      const tracker = entry.value as StreamTracker;
      if (!tracker?.platform || !tracker?.username || !tracker?.channelId) continue;
      if (byPlatform[tracker.platform]) {
        byPlatform[tracker.platform].push(tracker);
      }
    }

    let notified = 0;
    let cleared = 0;
    let errors = 0;

    // --- Twitch (batched) ---
    if (byPlatform.twitch.length > 0 && CONFIG.twitchClientId && CONFIG.twitchClientSecret) {
      try {
        const usernames = byPlatform.twitch.map((t) => t.username);
        const statuses = await checkTwitchStreams(usernames);

        const results = await parallelMap(
          byPlatform.twitch,
          async (tracker) => {
            const status = statuses.get(tracker.username.toLowerCase());
            if (!status) return "noop" as const;
            return await processTracker(tracker, status);
          },
          CONCURRENCY,
        );
        for (const r of results) {
          if (r.status === "fulfilled") {
            if (r.value === "notified") notified++;
            else if (r.value === "cleared") cleared++;
          }
        }
      } catch (err) {
        errors++;
        logger.error("Twitch batch check failed:", err);
      }
    }

    // --- YouTube (per-channel, parallel) ---
    if (byPlatform.youtube.length > 0 && CONFIG.youtubeApiKey) {
      const results = await parallelMap(
        byPlatform.youtube,
        async (tracker) => {
          const status = await checkYouTubeStream(tracker.username);
          return await processTracker(tracker, status);
        },
        CONCURRENCY,
      );
      for (const r of results) {
        if (r.status === "fulfilled") {
          if (r.value === "notified") notified++;
          else if (r.value === "cleared") cleared++;
        } else {
          errors++;
          logger.error("YouTube check failed:", r.reason);
        }
      }
    }

    // --- Kick (per-user, parallel) ---
    if (byPlatform.kick.length > 0) {
      const results = await parallelMap(
        byPlatform.kick,
        async (tracker) => {
          const status = await checkKickStream(tracker.username);
          return await processTracker(tracker, status);
        },
        CONCURRENCY,
      );
      for (const r of results) {
        if (r.status === "fulfilled") {
          if (r.value === "notified") notified++;
          else if (r.value === "cleared") cleared++;
        } else {
          errors++;
          logger.error("Kick check failed:", r.reason);
        }
      }
    }

    const total = byPlatform.twitch.length + byPlatform.youtube.length + byPlatform.kick.length;
    logger.info(
      `Run complete: ${total} tracker(s) — ${notified} notified, ${cleared} cleared, ${errors} error(s)`,
    );
  } finally {
    await finalizeAllLoggers();
  }
}
