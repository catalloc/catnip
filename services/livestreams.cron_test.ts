import "../test/_mocks/env.ts";
import { assertEquals, assert } from "../test/assert.ts";
import { sqlite } from "../test/_mocks/sqlite.ts";
import { kv } from "../discord/persistence/kv.ts";
import { mockFetch, getCalls, restoreFetch } from "../test/_mocks/fetch.ts";
import type { StreamTracker } from "../discord/interactions/commands/livestream.ts";
import { streamLiveKey } from "../discord/interactions/commands/livestream.ts";
import runCron from "./livestreams.cron.ts";

function resetStore() {
  (sqlite as any)._reset();
}

function makeTracker(overrides?: Partial<StreamTracker>): StreamTracker {
  return {
    guildId: "g1",
    platform: "kick",
    username: "streamer1",
    displayName: "Streamer1",
    channelId: "c1",
    addedBy: "u1",
    addedAt: new Date().toISOString(),
    ...overrides,
  };
}

// --- No trackers ---

Deno.test("livestreams cron: no-op when no trackers exist", async () => {
  resetStore();
  mockFetch();
  try {
    await runCron();
    assertEquals(getCalls().length, 0);
  } finally {
    restoreFetch();
  }
});

// --- Kick (no API key needed) ---

Deno.test("livestreams cron: Kick live stream sends notification", async () => {
  resetStore();
  const key = "stream:g1:kick:streamer1";
  await kv.set(key, makeTracker());

  mockFetch({
    responses: [
      // Kick API response — live
      {
        status: 200,
        body: {
          livestream: {
            is_live: true,
            session_title: "Playing Games",
            viewer_count: 42,
            thumbnail: { url: "https://example.com/thumb.jpg" },
          },
        },
      },
      // Discord message post — success
      { status: 200, body: { id: "msg1" } },
    ],
  });

  try {
    await runCron();

    // Should have called Kick API + Discord API
    const calls = getCalls();
    assertEquals(calls.length, 2);
    assert(calls[0].url.includes("kick.com/api/v2/channels/streamer1"));
    assert(calls[1].url.includes("channels/c1/messages"));

    // Live state should be stored
    const liveState = await kv.get(streamLiveKey("g1", "kick", "streamer1"));
    assert(liveState !== null, "Should store live state");
  } finally {
    restoreFetch();
  }
});

Deno.test("livestreams cron: Kick offline clears live state", async () => {
  resetStore();
  const key = "stream:g1:kick:streamer1";
  await kv.set(key, makeTracker());

  // Pre-set live state
  const liveKey = streamLiveKey("g1", "kick", "streamer1");
  await kv.set(liveKey, { title: "Old Stream", url: "https://kick.com/streamer1", notifiedAt: new Date().toISOString() });

  mockFetch({
    responses: [
      // Kick API — offline
      { status: 200, body: { livestream: null } },
    ],
  });

  try {
    await runCron();
    const liveState = await kv.get(liveKey);
    assertEquals(liveState, null, "Live state should be cleared when offline");
  } finally {
    restoreFetch();
  }
});

Deno.test("livestreams cron: does not re-notify for already-live stream", async () => {
  resetStore();
  const key = "stream:g1:kick:streamer1";
  await kv.set(key, makeTracker());

  // Pre-set live state (already notified)
  const liveKey = streamLiveKey("g1", "kick", "streamer1");
  await kv.set(liveKey, { title: "Existing", url: "https://kick.com/streamer1", notifiedAt: new Date().toISOString() });

  mockFetch({
    responses: [
      // Kick API — still live
      {
        status: 200,
        body: {
          livestream: {
            is_live: true,
            session_title: "Still Playing",
            viewer_count: 100,
          },
        },
      },
    ],
  });

  try {
    await runCron();
    const calls = getCalls();
    // Should call Kick API but NOT Discord (already notified)
    assertEquals(calls.length, 1);
    assert(calls[0].url.includes("kick.com"));
  } finally {
    restoreFetch();
  }
});

Deno.test("livestreams cron: Discord failure cleans up live state", async () => {
  resetStore();
  const key = "stream:g1:kick:streamer1";
  await kv.set(key, makeTracker());

  mockFetch({
    responses: [
      // Kick API — live
      {
        status: 200,
        body: {
          livestream: {
            is_live: true,
            session_title: "Stream",
            viewer_count: 10,
          },
        },
      },
      // Discord post fails (discordBotFetch retries internally, mock returns same for all)
      { status: 500, body: "Internal Server Error" },
      { status: 500, body: "Internal Server Error" },
      { status: 500, body: "Internal Server Error" },
    ],
  });

  try {
    await runCron();
    // Live state should be cleaned up on notification failure
    const liveKey = streamLiveKey("g1", "kick", "streamer1");
    const liveState = await kv.get(liveKey);
    assertEquals(liveState, null, "Live state should be cleaned up on Discord failure");
  } finally {
    restoreFetch();
  }
});

Deno.test("livestreams cron: skips trackers with missing fields", async () => {
  resetStore();
  // Invalid tracker — missing channelId
  await kv.set("stream:g1:kick:bad", { guildId: "g1", platform: "kick", username: "bad" });

  mockFetch();
  try {
    await runCron();
    assertEquals(getCalls().length, 0);
  } finally {
    restoreFetch();
  }
});

Deno.test("livestreams cron: cooldown prevents re-notification after offline/online cycle", async () => {
  resetStore();
  const key = "stream:g1:kick:streamer1";
  await kv.set(key, makeTracker());

  // Set a recent cooldown (just went offline)
  const cooldownKey = "stream_cooldown:g1:kick:streamer1";
  await kv.set(cooldownKey, { clearedAt: Date.now() }, Date.now() + 5 * 60 * 1000);

  mockFetch({
    responses: [
      // Kick API — live again
      {
        status: 200,
        body: {
          livestream: {
            is_live: true,
            session_title: "Back!",
            viewer_count: 5,
          },
        },
      },
    ],
  });

  try {
    await runCron();
    const calls = getCalls();
    // Should call Kick API but NOT Discord (cooldown active)
    assertEquals(calls.length, 1);
    assert(calls[0].url.includes("kick.com"));
  } finally {
    restoreFetch();
  }
});

// --- Twitch (requires env vars) ---

Deno.test("livestreams cron: Twitch batch check sends notification", async () => {
  resetStore();
  Deno.env.set("TWITCH_CLIENT_ID", "test_twitch_id");
  Deno.env.set("TWITCH_CLIENT_SECRET", "test_twitch_secret");

  const key = "stream:g1:twitch:twitchuser";
  await kv.set(key, makeTracker({ platform: "twitch", username: "twitchuser", displayName: "TwitchUser" }));

  mockFetch({
    responses: [
      // Twitch token request
      { status: 200, body: { access_token: "tok123", expires_in: 3600 } },
      // Twitch streams API — live
      {
        status: 200,
        body: {
          data: [
            {
              user_login: "twitchuser",
              title: "Twitch Stream!",
              viewer_count: 200,
              thumbnail_url: "https://example.com/{width}x{height}.jpg",
            },
          ],
        },
      },
      // Discord message post
      { status: 200, body: { id: "msg2" } },
    ],
  });

  try {
    await runCron();
    const calls = getCalls();
    assert(calls.length >= 2, "Should call Twitch API and Discord");
    assert(calls.some((c) => c.url.includes("twitch.tv")), "Should call Twitch API");
    assert(calls.some((c) => c.url.includes("channels/c1/messages")), "Should post to Discord");

    const liveState = await kv.get(streamLiveKey("g1", "twitch", "twitchuser"));
    assert(liveState !== null, "Should store live state");
  } finally {
    Deno.env.delete("TWITCH_CLIENT_ID");
    Deno.env.delete("TWITCH_CLIENT_SECRET");
    restoreFetch();
  }
});

Deno.test("livestreams cron: Twitch skipped when credentials missing", async () => {
  resetStore();
  Deno.env.delete("TWITCH_CLIENT_ID");
  Deno.env.delete("TWITCH_CLIENT_SECRET");

  const key = "stream:g1:twitch:twitchuser";
  await kv.set(key, makeTracker({ platform: "twitch", username: "twitchuser" }));

  mockFetch();
  try {
    await runCron();
    assertEquals(getCalls().length, 0, "Should not call any API when Twitch creds missing");
  } finally {
    restoreFetch();
  }
});

// --- YouTube (requires env var) ---

Deno.test("livestreams cron: YouTube live sends notification", async () => {
  resetStore();
  Deno.env.set("YOUTUBE_API_KEY", "test_yt_key");

  const key = "stream:g1:youtube:UCxyz";
  await kv.set(key, makeTracker({ platform: "youtube", username: "UCxyz", displayName: "YouTuber" }));

  mockFetch({
    responses: [
      // YouTube API — live
      {
        status: 200,
        body: {
          items: [
            {
              id: { videoId: "vid123" },
              snippet: {
                title: "YouTube Live!",
                thumbnails: { high: { url: "https://example.com/yt-thumb.jpg" } },
              },
            },
          ],
        },
      },
      // Discord message post
      { status: 200, body: { id: "msg3" } },
    ],
  });

  try {
    await runCron();
    const calls = getCalls();
    assert(calls.some((c) => c.url.includes("googleapis.com")), "Should call YouTube API");
    assert(calls.some((c) => c.url.includes("channels/c1/messages")), "Should post to Discord");
  } finally {
    Deno.env.delete("YOUTUBE_API_KEY");
    restoreFetch();
  }
});

Deno.test("livestreams cron: YouTube skipped when API key missing", async () => {
  resetStore();
  Deno.env.delete("YOUTUBE_API_KEY");

  const key = "stream:g1:youtube:UCxyz";
  await kv.set(key, makeTracker({ platform: "youtube", username: "UCxyz" }));

  mockFetch();
  try {
    await runCron();
    assertEquals(getCalls().length, 0);
  } finally {
    restoreFetch();
  }
});

// --- Multiple platforms ---

Deno.test("livestreams cron: processes multiple platforms in one run", async () => {
  resetStore();

  // Only Kick (no twitch/youtube creds)
  Deno.env.delete("TWITCH_CLIENT_ID");
  Deno.env.delete("TWITCH_CLIENT_SECRET");
  Deno.env.delete("YOUTUBE_API_KEY");

  await kv.set("stream:g1:kick:streamer1", makeTracker({ username: "streamer1" }));
  await kv.set("stream:g1:kick:streamer2", makeTracker({ username: "streamer2", displayName: "Streamer2", channelId: "c2" }));

  mockFetch({
    responses: [
      // Kick API — streamer1 live
      {
        status: 200,
        body: {
          livestream: { is_live: true, session_title: "S1 Live", viewer_count: 10 },
        },
      },
      // Kick API — streamer2 offline
      { status: 200, body: { livestream: null } },
      // Discord notification for streamer1
      { status: 200, body: { id: "msg4" } },
    ],
  });

  try {
    await runCron();
    const calls = getCalls();
    // 2 Kick API calls + 1 Discord notification
    // Order may vary due to parallelMap, but we should have exactly 3 calls
    assertEquals(calls.length, 3);
  } finally {
    restoreFetch();
  }
});
