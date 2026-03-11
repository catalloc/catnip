import "../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../test/assert.ts";
import { sqlite } from "../../test/_mocks/sqlite.ts";
import { activityLock, _internals } from "./activity-lock.ts";

function resetStore() {
  (sqlite as any)._reset();
}

Deno.test("_internals.lockKey: correct format", () => {
  assertEquals(_internals.lockKey("g1", "u1"), "activity:g1:u1");
});

Deno.test("acquireLock: succeeds when no lock exists", async () => {
  resetStore();
  const result = await activityLock.acquireLock("g1", "u1", "blackjack");
  assertEquals(result.success, true);
});

Deno.test("acquireLock: rejects when unexpired lock exists", async () => {
  resetStore();
  await activityLock.acquireLock("g1", "u1", "blackjack");
  const result = await activityLock.acquireLock("g1", "u1", "blackjack");
  assertEquals(result.success, false);
  assert(result.error?.includes("blackjack"));
});

Deno.test("acquireLock: allows after lock expires", async () => {
  resetStore();
  const now = 1000000;
  await activityLock.acquireLock("g1", "u1", "blackjack", undefined, now + 100, now);
  // Lock expired
  const result = await activityLock.acquireLock("g1", "u1", "blackjack", undefined, undefined, now + 200);
  assertEquals(result.success, true);
});

Deno.test("acquireLock: allows after release", async () => {
  resetStore();
  await activityLock.acquireLock("g1", "u1", "blackjack");
  await activityLock.releaseLock("g1", "u1");
  const result = await activityLock.acquireLock("g1", "u1", "blackjack");
  assertEquals(result.success, true);
});

Deno.test("requireNoActivity: allowed when no lock", async () => {
  resetStore();
  const result = await activityLock.requireNoActivity("g1", "u1");
  assertEquals(result.allowed, true);
});

Deno.test("requireNoActivity: blocked when lock active", async () => {
  resetStore();
  await activityLock.acquireLock("g1", "u1", "blackjack");
  const result = await activityLock.requireNoActivity("g1", "u1");
  assertEquals(result.allowed, false);
  assert(result.error?.includes("blackjack"));
});

Deno.test("requireNoActivity: allowed when lock expired", async () => {
  resetStore();
  const now = 1000000;
  await activityLock.acquireLock("g1", "u1", "blackjack", undefined, now + 100, now);
  const result = await activityLock.requireNoActivity("g1", "u1", now + 200);
  assertEquals(result.allowed, true);
});

Deno.test("getCurrentActivity: returns lock when active", async () => {
  resetStore();
  const now = 1000000;
  await activityLock.acquireLock("g1", "u1", "blackjack", undefined, undefined, now);
  const lock = await activityLock.getCurrentActivity("g1", "u1", now + 1000);
  assertEquals(lock?.activityType, "blackjack");
});

Deno.test("getCurrentActivity: returns null when no lock", async () => {
  resetStore();
  const lock = await activityLock.getCurrentActivity("g1", "u1");
  assertEquals(lock, null);
});

Deno.test("getCurrentActivity: returns null and cleans expired lock", async () => {
  resetStore();
  const now = 1000000;
  await activityLock.acquireLock("g1", "u1", "blackjack", undefined, now + 100, now);
  const lock = await activityLock.getCurrentActivity("g1", "u1", now + 200);
  assertEquals(lock, null);
});

Deno.test("acquireLock: different users don't conflict", async () => {
  resetStore();
  const r1 = await activityLock.acquireLock("g1", "u1", "blackjack");
  const r2 = await activityLock.acquireLock("g1", "u2", "blackjack");
  assertEquals(r1.success, true);
  assertEquals(r2.success, true);
});

Deno.test("acquireLock: same user different guilds don't conflict", async () => {
  resetStore();
  const r1 = await activityLock.acquireLock("g1", "u1", "blackjack");
  const r2 = await activityLock.acquireLock("g2", "u1", "blackjack");
  assertEquals(r1.success, true);
  assertEquals(r2.success, true);
});
