import "../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../test/assert.ts";
import { sqlite } from "../../test/_mocks/sqlite.ts";
import { jobs, shifts, getTierConfig, getTierIndex, computeEarnings, DEFAULT_JOB_TIERS, _internals } from "./jobs.ts";

function resetStore() {
  (sqlite as any)._reset();
}

Deno.test("jobs _internals.jobKey: correct format", () => {
  assertEquals(_internals.jobKey("g1", "u1"), "job:g1:u1");
});

Deno.test("getTierConfig: returns correct tier", () => {
  const tier = getTierConfig("programmer");
  assertEquals(tier.hourlyRate, 120);
  assertEquals(tier.name, "Programmer");
});

Deno.test("getTierConfig: falls back to unemployed for unknown", () => {
  const tier = getTierConfig("nonexistent" as any);
  assertEquals(tier.id, "unemployed");
});

Deno.test("getTierIndex: returns correct index", () => {
  assertEquals(getTierIndex("unemployed"), 0);
  assertEquals(getTierIndex("mafia-boss"), 9);
});

Deno.test("computeEarnings: calculates whole hours only", () => {
  const base = 1000000;
  const twoHoursLater = base + 2 * 3_600_000 + 500_000; // 2h 8m 20s
  const { hours, coins } = computeEarnings(base, 50, twoHoursLater);
  assertEquals(hours, 2);
  assertEquals(coins, 100);
});

Deno.test("computeEarnings: zero for less than 1 hour", () => {
  const base = 1000000;
  const { hours, coins } = computeEarnings(base, 100, base + 1_800_000);
  assertEquals(hours, 0);
  assertEquals(coins, 0);
});

Deno.test("computeEarnings: zero rate for unemployed", () => {
  const base = 1000000;
  const { coins } = computeEarnings(base, 0, base + 10 * 3_600_000);
  assertEquals(coins, 0);
});

Deno.test("jobs getOrCreate: creates default state", async () => {
  resetStore();
  const state = await jobs.getOrCreate("g1", "u1");
  assertEquals(state.tierId, "unemployed");
  assertEquals(state.userId, "u1");
  assertEquals(state.guildId, "g1");
});

Deno.test("jobs getOrCreate: returns existing", async () => {
  resetStore();
  const first = await jobs.getOrCreate("g1", "u1");
  await jobs.setTier("g1", "u1", "chef");
  const second = await jobs.getOrCreate("g1", "u1");
  assertEquals(second.tierId, "chef");
});

Deno.test("jobs collect: returns earnings and updates lastCollectedAt", async () => {
  resetStore();
  const state = await jobs.getOrCreate("g1", "u1");
  await jobs.setTier("g1", "u1", "cashier"); // 25/hr
  const collectTime = state.createdAt + 3 * 3_600_000; // 3 hours later
  const { hours, coins } = await jobs.collect("g1", "u1", collectTime);
  assertEquals(hours, 3);
  assertEquals(coins, 75);
});

Deno.test("jobs collect: no double-collect", async () => {
  resetStore();
  const state = await jobs.getOrCreate("g1", "u1");
  await jobs.setTier("g1", "u1", "burger-flipper"); // 10/hr
  const collectTime = state.createdAt + 2 * 3_600_000;
  const first = await jobs.collect("g1", "u1", collectTime);
  assertEquals(first.coins, 20);
  // Collect again at same time — should be 0
  const second = await jobs.collect("g1", "u1", collectTime);
  assertEquals(second.coins, 0);
});

Deno.test("jobs setTier: updates tier", async () => {
  resetStore();
  await jobs.getOrCreate("g1", "u1");
  const updated = await jobs.setTier("g1", "u1", "doctor");
  assertEquals(updated.tierId, "doctor");
});

Deno.test("DEFAULT_JOB_TIERS: has 10 tiers", () => {
  assertEquals(DEFAULT_JOB_TIERS.length, 10);
  assertEquals(DEFAULT_JOB_TIERS[0].id, "unemployed");
  assertEquals(DEFAULT_JOB_TIERS[9].id, "mafia-boss");
});

Deno.test("DEFAULT_JOB_TIERS: all have shift fields", () => {
  for (const tier of DEFAULT_JOB_TIERS) {
    assertEquals(typeof tier.shiftDurationMs, "number");
    assertEquals(typeof tier.shiftPayout, "number");
  }
});

// ── Shift Tests ──────────────────────────────────────────

Deno.test("shifts _internals.shiftKey: correct format", () => {
  assertEquals(_internals.shiftKey("g1", "u1"), "job-shift:g1:u1");
});

Deno.test("shifts startShift: fails when unemployed", async () => {
  resetStore();
  const result = await shifts.startShift("g1", "u1", "unemployed");
  assertEquals(result.success, false);
  assert(result.error?.includes("unemployed"));
});

Deno.test("shifts startShift: creates shift", async () => {
  resetStore();
  const now = 1000000;
  const result = await shifts.startShift("g1", "u1", "burger-flipper", now);
  assertEquals(result.success, true);
  assertEquals(result.state?.tierId, "burger-flipper");
  assertEquals(result.state?.readyAt, now + 15 * 60_000);
});

Deno.test("shifts startShift: rejects duplicate", async () => {
  resetStore();
  await shifts.startShift("g1", "u1", "burger-flipper");
  const result = await shifts.startShift("g1", "u1", "burger-flipper");
  assertEquals(result.success, false);
  assert(result.error?.includes("already have"));
});

Deno.test("shifts collectShift: not ready", async () => {
  resetStore();
  const now = 1000000;
  await shifts.startShift("g1", "u1", "burger-flipper", now);
  const result = await shifts.collectShift("g1", "u1", now + 60_000);
  assertEquals(result.success, false);
  assert(result.error?.includes("isn't done"));
});

Deno.test("shifts collectShift: success", async () => {
  resetStore();
  const now = 1000000;
  await shifts.startShift("g1", "u1", "burger-flipper", now);
  const result = await shifts.collectShift("g1", "u1", now + 15 * 60_000);
  assertEquals(result.success, true);
  assertEquals(result.coins, 15);
  assertEquals(result.xpAmount, 5);
});

Deno.test("shifts collectShift: double collect rejected", async () => {
  resetStore();
  const now = 1000000;
  await shifts.startShift("g1", "u1", "burger-flipper", now);
  await shifts.collectShift("g1", "u1", now + 15 * 60_000);
  const result = await shifts.collectShift("g1", "u1", now + 15 * 60_000 + 1000);
  assertEquals(result.success, false);
  assert(result.error?.includes("already collected"));
});

Deno.test("shifts collectShift: no active shift", async () => {
  resetStore();
  const result = await shifts.collectShift("g1", "u1");
  assertEquals(result.success, false);
  assert(result.error?.includes("don't have"));
});

Deno.test("shifts getShift: returns shift", async () => {
  resetStore();
  await shifts.startShift("g1", "u1", "cashier");
  const shift = await shifts.getShift("g1", "u1");
  assertEquals(shift?.tierId, "cashier");
});

Deno.test("shifts getShift: null when none", async () => {
  resetStore();
  const shift = await shifts.getShift("g1", "u1");
  assertEquals(shift, null);
});
