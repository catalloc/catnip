import "../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../test/assert.ts";
import { sqlite } from "../../test/_mocks/sqlite.ts";
import { profile, _internals } from "./profile.ts";

function resetStore() {
  (sqlite as any)._reset();
}

Deno.test("profile _internals.profileKey: correct format", () => {
  assertEquals(_internals.profileKey("g1", "u1"), "profile:g1:u1");
});

Deno.test("profile getOrCreate: creates default", async () => {
  resetStore();
  const data = await profile.getOrCreate("g1", "u1");
  assertEquals(data.userId, "u1");
  assertEquals(data.guildId, "g1");
  assertEquals(data.badgeIds.length, 0);
  assertEquals(data.title, undefined);
  assertEquals(data.borderColor, undefined);
});

Deno.test("profile getOrCreate: returns existing", async () => {
  resetStore();
  await profile.setTitle("g1", "u1", "The Grinder");
  const data = await profile.getOrCreate("g1", "u1");
  assertEquals(data.title, "The Grinder");
});

Deno.test("profile setTitle: sets title", async () => {
  resetStore();
  const data = await profile.setTitle("g1", "u1", "Champion");
  assertEquals(data.title, "Champion");
});

Deno.test("profile addBadge: adds badge and auto-sets active", async () => {
  resetStore();
  const data = await profile.addBadge("g1", "u1", "star");
  assertEquals(data.badgeIds, ["star"]);
  assertEquals(data.activeBadgeId, "star");
});

Deno.test("profile addBadge: no duplicates", async () => {
  resetStore();
  await profile.addBadge("g1", "u1", "star");
  const data = await profile.addBadge("g1", "u1", "star");
  assertEquals(data.badgeIds.length, 1);
});

Deno.test("profile addBadge: multiple badges", async () => {
  resetStore();
  await profile.addBadge("g1", "u1", "star");
  const data = await profile.addBadge("g1", "u1", "crown");
  assertEquals(data.badgeIds.length, 2);
  assertEquals(data.activeBadgeId, "star"); // first badge stays active
});

Deno.test("profile setActiveBadge: sets active badge", async () => {
  resetStore();
  await profile.addBadge("g1", "u1", "star");
  await profile.addBadge("g1", "u1", "crown");
  const result = await profile.setActiveBadge("g1", "u1", "crown");
  assertEquals(result.success, true);
  assertEquals(result.data?.activeBadgeId, "crown");
});

Deno.test("profile setActiveBadge: rejects unowned badge", async () => {
  resetStore();
  const result = await profile.setActiveBadge("g1", "u1", "fake");
  assertEquals(result.success, false);
  assert(result.error?.includes("don't own"));
});

Deno.test("profile setBorderColor: sets color", async () => {
  resetStore();
  const data = await profile.setBorderColor("g1", "u1", 0xFFD700);
  assertEquals(data.borderColor, 0xFFD700);
});
