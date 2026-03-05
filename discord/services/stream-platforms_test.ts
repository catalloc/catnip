import "../../test/_mocks/env.ts";
import { assertEquals, assert, assertRejects } from "../../test/assert.ts";
import { mockFetch, getCalls, restoreFetch } from "../../test/_mocks/fetch.ts";
import { checkTwitchStreams, checkYouTubeStream, checkKickStream } from "./stream-platforms.ts";

// --- Twitch ---

Deno.test("twitch: empty array returns empty map", async () => {
  const result = await checkTwitchStreams([]);
  assertEquals(result.size, 0);
});

Deno.test("twitch: single live user", async () => {
  Deno.env.set("TWITCH_CLIENT_ID", "test_id");
  Deno.env.set("TWITCH_CLIENT_SECRET", "test_secret");
  mockFetch({
    responses: [
      // Token request
      { status: 200, body: { access_token: "tok", expires_in: 3600 } },
      // Streams API
      {
        status: 200,
        body: {
          data: [{
            user_login: "ninja",
            title: "Playing Fortnite",
            viewer_count: 50000,
            thumbnail_url: "https://img.twitch.tv/{width}x{height}.jpg",
          }],
        },
      },
    ],
  });
  try {
    const result = await checkTwitchStreams(["ninja"]);
    assertEquals(result.size, 1);
    const ninja = result.get("ninja")!;
    assertEquals(ninja.isLive, true);
    assertEquals(ninja.title, "Playing Fortnite");
    assertEquals(ninja.viewerCount, 50000);
    assert(ninja.streamUrl.includes("twitch.tv/ninja"));
  } finally {
    restoreFetch();
    Deno.env.delete("TWITCH_CLIENT_ID");
    Deno.env.delete("TWITCH_CLIENT_SECRET");
  }
});

Deno.test("twitch: mixed live/offline", async () => {
  Deno.env.set("TWITCH_CLIENT_ID", "test_id");
  Deno.env.set("TWITCH_CLIENT_SECRET", "test_secret");
  // Token is cached from prior test, so only need streams response
  mockFetch({
    default: {
      status: 200,
      body: {
        data: [{ user_login: "live_user", title: "Live!", viewer_count: 100, thumbnail_url: "" }],
      },
    },
  });
  try {
    const result = await checkTwitchStreams(["live_user", "offline_user"]);
    assertEquals(result.get("live_user")!.isLive, true);
    assertEquals(result.get("offline_user")!.isLive, false);
  } finally {
    restoreFetch();
    Deno.env.delete("TWITCH_CLIENT_ID");
    Deno.env.delete("TWITCH_CLIENT_SECRET");
  }
});

Deno.test("twitch: streams API error throws", async () => {
  Deno.env.set("TWITCH_CLIENT_ID", "test_id");
  Deno.env.set("TWITCH_CLIENT_SECRET", "test_secret");
  // Token is cached, so the 401 hits the streams endpoint
  mockFetch({ default: { status: 401, body: "Unauthorized" } });
  try {
    await assertRejects(
      () => checkTwitchStreams(["user"]),
      Error,
      "Twitch streams API failed",
    );
  } finally {
    restoreFetch();
    Deno.env.delete("TWITCH_CLIENT_ID");
    Deno.env.delete("TWITCH_CLIENT_SECRET");
  }
});

// --- YouTube ---

Deno.test("youtube: live returns isLive true with video URL", async () => {
  Deno.env.set("YOUTUBE_API_KEY", "test_key");
  mockFetch({
    default: {
      status: 200,
      body: {
        items: [{
          id: { videoId: "abc123" },
          snippet: { title: "Live Stream", thumbnails: { high: { url: "https://thumb.jpg" } } },
        }],
      },
    },
  });
  try {
    const result = await checkYouTubeStream("UCtest");
    assertEquals(result.isLive, true);
    assertEquals(result.title, "Live Stream");
    assert(result.streamUrl.includes("abc123"));
  } finally {
    restoreFetch();
    Deno.env.delete("YOUTUBE_API_KEY");
  }
});

Deno.test("youtube: not live returns isLive false", async () => {
  Deno.env.set("YOUTUBE_API_KEY", "test_key");
  mockFetch({ default: { status: 200, body: { items: [] } } });
  try {
    const result = await checkYouTubeStream("UCtest");
    assertEquals(result.isLive, false);
    assert(result.streamUrl.includes("UCtest"));
  } finally {
    restoreFetch();
    Deno.env.delete("YOUTUBE_API_KEY");
  }
});

Deno.test("youtube: missing API key throws", async () => {
  Deno.env.delete("YOUTUBE_API_KEY");
  await assertRejects(
    () => checkYouTubeStream("UCtest"),
    Error,
    "YOUTUBE_API_KEY",
  );
});

// --- Kick ---

Deno.test("kick: live stream returns data", async () => {
  mockFetch({
    default: {
      status: 200,
      body: {
        livestream: {
          is_live: true,
          session_title: "Gaming Live",
          viewer_count: 500,
          thumbnail: { url: "https://thumb.jpg" },
        },
      },
    },
  });
  try {
    const result = await checkKickStream("testuser");
    assertEquals(result.isLive, true);
    assertEquals(result.title, "Gaming Live");
    assertEquals(result.viewerCount, 500);
  } finally {
    restoreFetch();
  }
});

Deno.test("kick: 404 returns offline", async () => {
  mockFetch({ default: { status: 404, body: "Not Found" } });
  try {
    const result = await checkKickStream("nonexistent");
    assertEquals(result.isLive, false);
    assert(result.streamUrl.includes("nonexistent"));
  } finally {
    restoreFetch();
  }
});

Deno.test("kick: API error throws", async () => {
  mockFetch({ default: { status: 500, body: "Server Error" } });
  try {
    await assertRejects(
      () => checkKickStream("user"),
      Error,
      "Kick API failed",
    );
  } finally {
    restoreFetch();
  }
});
