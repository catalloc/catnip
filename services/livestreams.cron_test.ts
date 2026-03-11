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

Deno.test("livestreams cron: CAS update failure on live state returns noop", { sanitizeOps: false, sanitizeResources: false }, async () => {
  resetStore();
  Deno.env.delete("TWITCH_CLIENT_ID");
  Deno.env.delete("TWITCH_CLIENT_SECRET");
  Deno.env.delete("YOUTUBE_API_KEY");

  const key = "stream:g1:kick:streamer_cas";
  await kv.set(key, makeTracker({ username: "streamer_cas" }));

  // Monkey-patch kv.update to throw a CAS error when setting live state
  const origUpdate = kv.update.bind(kv);
  (kv as any).update = async (...args: unknown[]) => {
    const k = args[0] as string;
    if (k.startsWith("stream_live:")) {
      throw new Error("CAS exhaustion");
    }
    return origUpdate(...(args as Parameters<typeof kv.update>));
  };

  mockFetch({
    responses: [
      // Kick API — live
      {
        status: 200,
        body: {
          livestream: { is_live: true, session_title: "CAS Test", viewer_count: 5 },
        },
      },
    ],
  });

  try {
    await runCron();
    // Should not crash; no Discord notification sent
    const calls = getCalls();
    const discordCalls = calls.filter((c) => c.url.includes("channels/c1/messages"));
    assertEquals(discordCalls.length, 0, "No Discord notification on CAS failure");
  } finally {
    (kv as any).update = origUpdate;
    restoreFetch();
  }
});

Deno.test("livestreams cron: Twitch token fetch failure (non-200)", { sanitizeOps: false, sanitizeResources: false }, async () => {
  resetStore();
  Deno.env.set("TWITCH_CLIENT_ID", "test_twitch_id");
  Deno.env.set("TWITCH_CLIENT_SECRET", "test_twitch_secret");
  Deno.env.delete("YOUTUBE_API_KEY");

  await kv.set("stream:g1:twitch:twitchfail", makeTracker({ platform: "twitch", username: "twitchfail" }));

  mockFetch({
    responses: [
      // Twitch token request fails
      { status: 401, body: { message: "Invalid client" } },
    ],
  });

  try {
    await runCron();
    // Should not crash — Twitch batch check catches the error
  } finally {
    Deno.env.delete("TWITCH_CLIENT_ID");
    Deno.env.delete("TWITCH_CLIENT_SECRET");
    restoreFetch();
  }
});

Deno.test("livestreams cron: YouTube API error returns noop", { sanitizeOps: false, sanitizeResources: false }, async () => {
  resetStore();
  Deno.env.set("YOUTUBE_API_KEY", "test_yt_key");
  Deno.env.delete("TWITCH_CLIENT_ID");
  Deno.env.delete("TWITCH_CLIENT_SECRET");

  await kv.set("stream:g1:youtube:UCfail", makeTracker({ platform: "youtube", username: "UCfail" }));

  mockFetch({
    responses: [
      // YouTube API returns 500
      { status: 500, body: "Internal Server Error" },
    ],
  });

  try {
    await runCron();
    // Should not crash
  } finally {
    Deno.env.delete("YOUTUBE_API_KEY");
    restoreFetch();
  }
});

Deno.test("livestreams cron: Kick API 404 treats as offline", async () => {
  resetStore();
  Deno.env.delete("TWITCH_CLIENT_ID");
  Deno.env.delete("TWITCH_CLIENT_SECRET");
  Deno.env.delete("YOUTUBE_API_KEY");

  await kv.set("stream:g1:kick:streamer404", makeTracker({ username: "streamer404" }));

  mockFetch({
    responses: [
      // Kick API returns 404
      { status: 404, body: { message: "Not Found" } },
    ],
  });

  try {
    await runCron();
    // 404 is treated as offline — no Discord notification
    const calls = getCalls();
    const discordCalls = calls.filter((c) => c.url.includes("channels/c1/messages"));
    assertEquals(discordCalls.length, 0, "No Discord notification for 404");
  } finally {
    restoreFetch();
  }
});

Deno.test("livestreams cron: Kick non-200 non-404 logs error", { sanitizeOps: false, sanitizeResources: false }, async () => {
  resetStore();
  Deno.env.delete("TWITCH_CLIENT_ID");
  Deno.env.delete("TWITCH_CLIENT_SECRET");
  Deno.env.delete("YOUTUBE_API_KEY");

  await kv.set("stream:g1:kick:streamer500", makeTracker({ username: "streamer500" }));

  mockFetch({
    responses: [
      // Kick API returns 500
      { status: 500, body: "Server Error" },
    ],
  });

  try {
    await runCron();
    // Should not crash — error is caught by parallelMap
  } finally {
    restoreFetch();
  }
});

Deno.test("livestreams cron: KV.delete failure on notification rollback logs error", { sanitizeOps: false, sanitizeResources: false }, async () => {
  resetStore();
  Deno.env.delete("TWITCH_CLIENT_ID");
  Deno.env.delete("TWITCH_CLIENT_SECRET");
  Deno.env.delete("YOUTUBE_API_KEY");

  await kv.set("stream:g1:kick:streamer_rollback", makeTracker({ username: "streamer_rollback" }));

  // Monkey-patch kv.delete to throw for live state cleanup
  const origDelete = kv.delete.bind(kv);
  (kv as any).delete = async (k: string) => {
    if (k.startsWith("stream_live:")) {
      throw new Error("Delete failed");
    }
    return origDelete(k);
  };

  mockFetch({
    responses: [
      // Kick API — live
      {
        status: 200,
        body: {
          livestream: { is_live: true, session_title: "Rollback Test", viewer_count: 5 },
        },
      },
      // Discord notification fails
      { status: 500, body: "Internal Server Error" },
      { status: 500, body: "Internal Server Error" },
      { status: 500, body: "Internal Server Error" },
    ],
  });

  try {
    await runCron();
    // Should not crash even though both Discord notification and live state cleanup fail
  } finally {
    (kv as any).delete = origDelete;
    restoreFetch();
  }
});

Deno.test("livestreams cron: mixed platform - one fails, others succeed", { sanitizeOps: false, sanitizeResources: false }, async () => {
  resetStore();
  Deno.env.delete("TWITCH_CLIENT_ID");
  Deno.env.delete("TWITCH_CLIENT_SECRET");
  Deno.env.delete("YOUTUBE_API_KEY");

  await kv.set("stream:g1:kick:fail_streamer", makeTracker({ username: "fail_streamer", channelId: "c_fail" }));
  await kv.set("stream:g1:kick:ok_streamer", makeTracker({ username: "ok_streamer", channelId: "c_ok" }));

  mockFetch({
    responses: [
      // Kick API — fail_streamer 500
      { status: 500, body: "Server Error" },
      // Kick API — ok_streamer live
      {
        status: 200,
        body: {
          livestream: { is_live: true, session_title: "OK Stream", viewer_count: 10 },
        },
      },
      // Discord notification for ok_streamer
      { status: 200, body: { id: "msg_ok" } },
    ],
  });

  try {
    await runCron();
    // One fails, one succeeds — cron should not crash
    const liveState = await kv.get(streamLiveKey("g1", "kick", "ok_streamer"));
    assert(liveState !== null, "Successful streamer should have live state");
  } finally {
    restoreFetch();
  }
});

Deno.test("livestreams cron: two Twitch trackers both get checked", async () => {
  resetStore();
  Deno.env.set("TWITCH_CLIENT_ID", "test_twitch_id");
  Deno.env.set("TWITCH_CLIENT_SECRET", "test_twitch_secret");
  Deno.env.delete("YOUTUBE_API_KEY");

  await kv.set("stream:g1:twitch:user1", makeTracker({ platform: "twitch", username: "user1", channelId: "c1" }));
  await kv.set("stream:g1:twitch:user2", makeTracker({ platform: "twitch", username: "user2", channelId: "c2" }));

  // Use a URL-matching mock approach: token may be cached from prior test.
  // Use default for Discord notifications. The responses list covers all possible calls in order:
  // If token cached: [streams API, Discord msg1, Discord msg2]
  // If token not cached: [token, streams API, Discord msg1, Discord msg2]
  // Either way, we use a smart default that works for Discord calls.
  const origFetch = globalThis.fetch;
  mockFetch();
  const twitchStreamsResponse = {
    data: [
      { user_login: "user1", title: "Stream 1", viewer_count: 50, thumbnail_url: "" },
      { user_login: "user2", title: "Stream 2", viewer_count: 30, thumbnail_url: "" },
    ],
  };
  // Override fetch to return context-appropriate responses
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    getCalls().push({ url, init });
    if (url.includes("twitch.tv/oauth2/token")) {
      return new Response(JSON.stringify({ access_token: "tok_batch", expires_in: 3600 }), { status: 200 });
    }
    if (url.includes("twitch.tv/helix/streams")) {
      return new Response(JSON.stringify(twitchStreamsResponse), { status: 200 });
    }
    // Discord API
    return new Response(JSON.stringify({ id: "msg_twitch" }), { status: 200 });
  }) as typeof globalThis.fetch;

  try {
    await runCron();
    const live1 = await kv.get(streamLiveKey("g1", "twitch", "user1"));
    const live2 = await kv.get(streamLiveKey("g1", "twitch", "user2"));
    assert(live1 !== null, "user1 should have live state");
    assert(live2 !== null, "user2 should have live state");
  } finally {
    Deno.env.delete("TWITCH_CLIENT_ID");
    Deno.env.delete("TWITCH_CLIENT_SECRET");
    globalThis.fetch = origFetch;
    restoreFetch();
  }
});

Deno.test("livestreams cron: multiple guilds tracking same streamer both notified", async () => {
  resetStore();
  Deno.env.delete("TWITCH_CLIENT_ID");
  Deno.env.delete("TWITCH_CLIENT_SECRET");
  Deno.env.delete("YOUTUBE_API_KEY");

  await kv.set("stream:g1:kick:shared_streamer", makeTracker({ guildId: "g1", username: "shared_streamer", channelId: "c1" }));
  await kv.set("stream:g2:kick:shared_streamer", makeTracker({ guildId: "g2", username: "shared_streamer", channelId: "c2" }));

  mockFetch({
    responses: [
      // Kick API for g1's check
      {
        status: 200,
        body: {
          livestream: { is_live: true, session_title: "Shared Stream", viewer_count: 100 },
        },
      },
      // Kick API for g2's check
      {
        status: 200,
        body: {
          livestream: { is_live: true, session_title: "Shared Stream", viewer_count: 100 },
        },
      },
      // Discord notification for g1
      { status: 200, body: { id: "msg_g1" } },
      // Discord notification for g2
      { status: 200, body: { id: "msg_g2" } },
    ],
  });

  try {
    await runCron();
    const live1 = await kv.get(streamLiveKey("g1", "kick", "shared_streamer"));
    const live2 = await kv.get(streamLiveKey("g2", "kick", "shared_streamer"));
    assert(live1 !== null, "Guild 1 should have live state");
    assert(live2 !== null, "Guild 2 should have live state");
  } finally {
    restoreFetch();
  }
});

Deno.test("livestreams cron: notification failure cleans up live state key", async () => {
  resetStore();
  Deno.env.delete("TWITCH_CLIENT_ID");
  Deno.env.delete("TWITCH_CLIENT_SECRET");
  Deno.env.delete("YOUTUBE_API_KEY");

  const key = "stream:g1:kick:streamer_cleanup";
  await kv.set(key, makeTracker({ username: "streamer_cleanup" }));

  mockFetch({
    responses: [
      // Kick API — live
      {
        status: 200,
        body: {
          livestream: { is_live: true, session_title: "Cleanup Test", viewer_count: 10 },
        },
      },
      // Discord notification fails
      { status: 500, body: "fail" },
      { status: 500, body: "fail" },
      { status: 500, body: "fail" },
    ],
  });

  try {
    await runCron();
    // Live state should be cleaned up on notification failure
    const liveKey = streamLiveKey("g1", "kick", "streamer_cleanup");
    const liveState = await kv.get(liveKey);
    assertEquals(liveState, null, "Live state key should be deleted after notification failure");
  } finally {
    restoreFetch();
  }
});

Deno.test("livestreams cron: offline cycle sets cooldown key", async () => {
  resetStore();
  Deno.env.delete("TWITCH_CLIENT_ID");
  Deno.env.delete("TWITCH_CLIENT_SECRET");
  Deno.env.delete("YOUTUBE_API_KEY");

  const key = "stream:g1:kick:streamer_cooldown";
  await kv.set(key, makeTracker({ username: "streamer_cooldown" }));

  // Pre-set live state (was previously live)
  const liveKey = streamLiveKey("g1", "kick", "streamer_cooldown");
  await kv.set(liveKey, { title: "Was Live", url: "https://kick.com/streamer_cooldown", notifiedAt: new Date().toISOString() });

  mockFetch({
    responses: [
      // Kick API — now offline
      { status: 200, body: { livestream: null } },
    ],
  });

  try {
    await runCron();
    // Live state should be cleared
    const liveState = await kv.get(liveKey);
    assertEquals(liveState, null, "Live state should be cleared when offline");

    // Cooldown key should be set
    const cooldownKey = "stream_cooldown:g1:kick:streamer_cooldown";
    const cooldown = await kv.get(cooldownKey);
    assert(cooldown !== null, "Cooldown key should be set after going offline");
  } finally {
    restoreFetch();
  }
});
