import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { generateCrashPoint, multiplierAtStep, advanceStep, crash, _internals } from "./crash.ts";
import type { CrashSession } from "../types.ts";

function resetStore() {
  (sqlite as any)._reset();
}

Deno.test("crash: generateCrashPoint returns value >= 1.0", () => {
  for (let i = 0; i < 100; i++) {
    const point = generateCrashPoint();
    assert(point >= 1.0, `Crash point ${point} should be >= 1.0`);
    assert(point <= 100, `Crash point ${point} should be <= 100`);
  }
});

Deno.test("crash: multiplierAtStep(0) is 1.0", () => {
  assertEquals(multiplierAtStep(0), 1.0);
});

Deno.test("crash: multiplierAtStep increases monotonically", () => {
  let prev = 0;
  for (let i = 0; i < 20; i++) {
    const m = multiplierAtStep(i);
    assert(m > prev, `Step ${i} (${m}) should be > step ${i - 1} (${prev})`);
    prev = m;
  }
});

Deno.test("crash: advanceStep detects crash", () => {
  const session: CrashSession = {
    guildId: "g1", userId: "u1", bet: 100,
    crashPoint: 1.2, currentMultiplier: 1.0, currentStep: 0,
    status: "playing", createdAt: Date.now(),
  };
  // Step 1 = 1.25, which is > 1.2, so it should crash
  const result = advanceStep(session);
  assert(result.crashed, "Should crash when multiplier exceeds crash point");
});

Deno.test("crash: advanceStep does not crash when under point", () => {
  const session: CrashSession = {
    guildId: "g1", userId: "u1", bet: 100,
    crashPoint: 5.0, currentMultiplier: 1.0, currentStep: 0,
    status: "playing", createdAt: Date.now(),
  };
  const result = advanceStep(session);
  assert(!result.crashed, "Should not crash when under crash point");
  assertEquals(session.currentStep, 1);
  assertEquals(session.currentMultiplier, multiplierAtStep(1));
});

Deno.test("crash session: create and retrieve", async () => {
  resetStore();
  const session = await crash.createSession("g1", "u1", 100);
  assertEquals(session.bet, 100);
  assertEquals(session.currentMultiplier, 1.0);
  assertEquals(session.currentStep, 0);
  assertEquals(session.status, "playing");

  const retrieved = await crash.getSession("g1", "u1");
  assert(retrieved !== null);
  assertEquals(retrieved!.bet, 100);
});

Deno.test("crash session: delete", async () => {
  resetStore();
  await crash.createSession("g1", "u1", 50);
  await crash.deleteSession("g1", "u1");
  const session = await crash.getSession("g1", "u1");
  assertEquals(session, null);
});

Deno.test("crash session: expired returns null", async () => {
  resetStore();
  const session = await crash.createSession("g1", "u1", 50);
  session.createdAt = Date.now() - _internals.SESSION_TTL_MS - 1000;
  await crash.updateSession(session);
  const retrieved = await crash.getSession("g1", "u1");
  assertEquals(retrieved, null);
});
