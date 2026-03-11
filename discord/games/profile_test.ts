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

// --- Batch 6d: additional coverage ---

Deno.test("profile: duplicate badge addBadge returns same list", async () => {
  resetStore();
  await profile.addBadge("g1", "u_dup", "star");
  await profile.addBadge("g1", "u_dup", "crown");
  const data = await profile.addBadge("g1", "u_dup", "star");
  // "star" should not be duplicated
  assertEquals(data.badgeIds.length, 2);
  assertEquals(data.badgeIds.filter((b) => b === "star").length, 1);
});

Deno.test("profile: setActiveBadge with non-owned badge returns error", async () => {
  resetStore();
  await profile.addBadge("g1", "u_noown", "star");
  const result = await profile.setActiveBadge("g1", "u_noown", "diamond");
  assertEquals(result.success, false);
  assert(result.error !== undefined);
  assert(result.error!.includes("don't own"));
});

Deno.test("profile: setBorderColor validates numeric color values", async () => {
  resetStore();
  // Valid hex color
  const data1 = await profile.setBorderColor("g1", "u_color", 0xFF0000);
  assertEquals(data1.borderColor, 0xFF0000);
  // Zero is valid
  const data2 = await profile.setBorderColor("g1", "u_color", 0x000000);
  assertEquals(data2.borderColor, 0x000000);
  // Max Discord embed color
  const data3 = await profile.setBorderColor("g1", "u_color", 0xFFFFFF);
  assertEquals(data3.borderColor, 0xFFFFFF);
});

Deno.test("profile: new user getOrCreate has default values", async () => {
  resetStore();
  const data = await profile.getOrCreate("g5", "u_fresh");
  assertEquals(data.userId, "u_fresh");
  assertEquals(data.guildId, "g5");
  assertEquals(data.title, undefined);
  assertEquals(data.borderColor, undefined);
  assertEquals(data.activeBadgeId, undefined);
  assertEquals(data.badgeIds.length, 0);
  assert(data.createdAt > 0);
  assert(data.updatedAt > 0);
});

Deno.test("profile: empty badges list returns empty array", async () => {
  resetStore();
  const data = await profile.getOrCreate("g1", "u_empty");
  assertEquals(Array.isArray(data.badgeIds), true);
  assertEquals(data.badgeIds, []);
});
