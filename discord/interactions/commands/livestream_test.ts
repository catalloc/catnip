import "../../../test/_mocks/env.ts";
import "../../../test/_mocks/sqlite.ts";
import { assertEquals, assert, assertStringIncludes } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { kv } from "../../persistence/kv.ts";
import command from "./livestream.ts";
import { streamKey, streamLiveKey } from "./livestream.ts";

function resetStore() {
  (sqlite as any)._reset();
}

const guildId = "g1";
const userId = "u1";
const ctx = (sub: string, opts: Record<string, unknown> = {}) =>
  ({ guildId, userId, options: { subcommand: sub, ...opts } }) as any;

// --- key format ---

Deno.test("livestream: streamKey format", () => {
  assertEquals(streamKey("g1", "twitch", "UserName"), "stream:g1:twitch:username");
});

Deno.test("livestream: streamLiveKey format", () => {
  assertEquals(streamLiveKey("g1", "twitch", "UserName"), "stream_live:g1:twitch:username");
});

// --- add ---

Deno.test("livestream add: creates tracker", async () => {
  resetStore();
  const result = await command.execute(
    ctx("add", { platform: "twitch", username: "ninja", channel: "ch1" }),
  );
  assertEquals(result.success, true);
  assertStringIncludes(result.message!, "ninja");
  assertStringIncludes(result.message!, "Twitch");
});

Deno.test("livestream add: rejects duplicate", async () => {
  resetStore();
  await command.execute(ctx("add", { platform: "twitch", username: "ninja", channel: "ch1" }));
  const result = await command.execute(
    ctx("add", { platform: "twitch", username: "ninja", channel: "ch2" }),
  );
  assertEquals(result.success, false);
  assertStringIncludes(result.error!, "already being tracked");
});

Deno.test("livestream add: rejects empty username", async () => {
  resetStore();
  const result = await command.execute(
    ctx("add", { platform: "twitch", username: "  ", channel: "ch1" }),
  );
  assertEquals(result.success, false);
  assertStringIncludes(result.error!, "empty");
});

Deno.test("livestream add: enforces MAX_TRACKERS (25)", async () => {
  resetStore();
  for (let i = 0; i < 25; i++) {
    await command.execute(ctx("add", { platform: "twitch", username: `user${i}`, channel: "ch1" }));
  }
  const result = await command.execute(
    ctx("add", { platform: "twitch", username: "user25", channel: "ch1" }),
  );
  assertEquals(result.success, false);
  assertStringIncludes(result.error!, "maximum");
});

// --- remove ---

Deno.test("livestream remove: deletes config and live state keys", async () => {
  resetStore();
  await command.execute(ctx("add", { platform: "twitch", username: "ninja", channel: "ch1" }));
  // Set a live state key
  await kv.set(streamLiveKey("g1", "twitch", "ninja"), { isLive: true });

  const result = await command.execute(
    ctx("remove", { platform: "twitch", username: "ninja" }),
  );
  assertEquals(result.success, true);
  assertStringIncludes(result.message!, "Stopped tracking");
  assertEquals(await kv.get(streamKey("g1", "twitch", "ninja")), null);
  assertEquals(await kv.get(streamLiveKey("g1", "twitch", "ninja")), null);
});

Deno.test("livestream remove: error for non-existent", async () => {
  resetStore();
  const result = await command.execute(
    ctx("remove", { platform: "twitch", username: "unknown" }),
  );
  assertEquals(result.success, false);
  assertStringIncludes(result.error!, "No tracker found");
});

// --- list ---

Deno.test("livestream list: empty returns message", async () => {
  resetStore();
  const result = await command.execute(ctx("list"));
  assertEquals(result.success, true);
  assertStringIncludes(result.message!, "No streamers");
});

Deno.test("livestream list: grouped by platform with footer count", async () => {
  resetStore();
  await command.execute(ctx("add", { platform: "twitch", username: "user1", channel: "ch1" }));
  await command.execute(ctx("add", { platform: "youtube", username: "user2", channel: "ch2" }));
  const result = await command.execute(ctx("list"));
  assertEquals(result.success, true);
  assert(result.embed);
  assertEquals(result.embed!.title, "Tracked Streamers");
  const fieldNames = result.embed!.fields!.map((f: any) => f.name);
  assert(fieldNames.includes("Twitch"));
  assert(fieldNames.includes("YouTube"));
  assertStringIncludes(result.embed!.footer!.text, "2/25");
});

// --- unknown subcommand ---

Deno.test("livestream: unknown subcommand error", async () => {
  resetStore();
  const result = await command.execute(ctx("bad"));
  assertEquals(result.success, false);
  assertStringIncludes(result.error!, "subcommand");
});
