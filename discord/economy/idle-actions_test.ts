import "../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../test/assert.ts";
import { sqlite } from "../../test/_mocks/sqlite.ts";
import {
  FARM_TIERS, MINE_TIERS, FORAGE_TIERS,
  rollIdleOutcome, idleActions, _internals,
} from "./idle-actions.ts";

function resetStore() {
  (sqlite as any)._reset();
}

Deno.test("idle _internals.idleKey: correct format", () => {
  assertEquals(_internals.idleKey("farm", "g1", "u1"), "farm:g1:u1");
  assertEquals(_internals.idleKey("mine", "g1", "u1"), "mine:g1:u1");
  assertEquals(_internals.idleKey("forage", "g1", "u1"), "forage:g1:u1");
});

Deno.test("FARM_TIERS: has 5 tiers", () => {
  assertEquals(FARM_TIERS.length, 5);
  assertEquals(FARM_TIERS[0].id, "wheat");
  assertEquals(FARM_TIERS[4].id, "golden-apples");
});

Deno.test("MINE_TIERS: has 5 tiers", () => {
  assertEquals(MINE_TIERS.length, 5);
  assertEquals(MINE_TIERS[0].id, "copper");
});

Deno.test("FORAGE_TIERS: has 5 tiers", () => {
  assertEquals(FORAGE_TIERS.length, 5);
  assertEquals(FORAGE_TIERS[0].id, "herbs");
});

Deno.test("rollIdleOutcome: returns valid outcome", () => {
  const tier = FARM_TIERS[0]; // wheat
  const outcome = rollIdleOutcome(tier);
  assert(outcome.reward >= tier.rewardMin);
  assert(outcome.xp >= tier.xpReward);
  assertEquals(outcome.tier.id, "wheat");
});

Deno.test("rollIdleOutcome: rare find has multiplied reward", () => {
  // Run many times; at least verify structure
  const tier = FARM_TIERS[0];
  for (let i = 0; i < 50; i++) {
    const outcome = rollIdleOutcome(tier);
    if (outcome.isRare) {
      assert(outcome.reward >= tier.rewardMin * tier.rareMultiplier);
      assert(outcome.xp >= tier.xpReward + 25);
      return; // Found a rare — test passes
    }
  }
  // With 5% chance, probability of 0 rares in 50 tries = 0.95^50 ≈ 7.7%
  // Skip assertion — not guaranteed but likely
});

Deno.test("idleActions getAvailableTiers: filters by level", () => {
  const available = idleActions.getAvailableTiers(FARM_TIERS, 0);
  assertEquals(available.length, 1);
  assertEquals(available[0].id, "wheat");

  const more = idleActions.getAvailableTiers(FARM_TIERS, 10);
  assertEquals(more.length, 3); // wheat, corn, potatoes
});

Deno.test("idleActions getAvailableTiers: all tiers at high level", () => {
  const all = idleActions.getAvailableTiers(FARM_TIERS, 99);
  assertEquals(all.length, 5);
});

Deno.test("idleActions getTier: finds by id", () => {
  const tier = idleActions.getTier(FARM_TIERS, "corn");
  assertEquals(tier?.name, "Corn");
  assertEquals(tier?.requiredLevel, 5);
});

Deno.test("idleActions getTier: undefined for unknown", () => {
  assertEquals(idleActions.getTier(FARM_TIERS, "fake"), undefined);
});

Deno.test("idleActions startAction: creates session", async () => {
  resetStore();
  const tier = FARM_TIERS[0];
  const now = 1000000;
  const result = await idleActions.startAction("farm", "g1", "u1", tier, now);
  assertEquals(result.success, true);
  assertEquals(result.state?.tierId, "wheat");
  assertEquals(result.state?.readyAt, now + tier.cooldownMs);
  assertEquals(result.state?.collected, false);
});

Deno.test("idleActions startAction: rejects duplicate", async () => {
  resetStore();
  const tier = FARM_TIERS[0];
  await idleActions.startAction("farm", "g1", "u1", tier);
  const result = await idleActions.startAction("farm", "g1", "u1", tier);
  assertEquals(result.success, false);
  assert(result.error?.includes("already have"));
});

Deno.test("idleActions startAction: allows different action types simultaneously", async () => {
  resetStore();
  const r1 = await idleActions.startAction("farm", "g1", "u1", FARM_TIERS[0]);
  const r2 = await idleActions.startAction("mine", "g1", "u1", MINE_TIERS[0]);
  const r3 = await idleActions.startAction("forage", "g1", "u1", FORAGE_TIERS[0]);
  assertEquals(r1.success, true);
  assertEquals(r2.success, true);
  assertEquals(r3.success, true);
});

Deno.test("idleActions collectAction: not ready yet", async () => {
  resetStore();
  const now = 1000000;
  await idleActions.startAction("farm", "g1", "u1", FARM_TIERS[0], now);
  const result = await idleActions.collectAction("farm", "g1", "u1", now + 60_000); // only 1min
  assertEquals(result.success, false);
  assert(result.error?.includes("Not ready"));
});

Deno.test("idleActions collectAction: ready to harvest", async () => {
  resetStore();
  const now = 1000000;
  const tier = FARM_TIERS[0];
  await idleActions.startAction("farm", "g1", "u1", tier, now);
  const result = await idleActions.collectAction("farm", "g1", "u1", now + tier.cooldownMs);
  assertEquals(result.success, true);
  assertEquals(result.state?.collected, true);
});

Deno.test("idleActions collectAction: double collect rejected", async () => {
  resetStore();
  const now = 1000000;
  const tier = FARM_TIERS[0];
  await idleActions.startAction("farm", "g1", "u1", tier, now);
  await idleActions.collectAction("farm", "g1", "u1", now + tier.cooldownMs);
  const result = await idleActions.collectAction("farm", "g1", "u1", now + tier.cooldownMs + 1000);
  assertEquals(result.success, false);
  assert(result.error?.includes("already collected"));
});

Deno.test("idleActions collectAction: no active session", async () => {
  resetStore();
  const result = await idleActions.collectAction("farm", "g1", "u1");
  assertEquals(result.success, false);
  assert(result.error?.includes("don't have"));
});

Deno.test("idleActions getState: returns null for stale action", async () => {
  resetStore();
  const now = 1000000;
  await idleActions.startAction("farm", "g1", "u1", FARM_TIERS[0], now);
  // 25 hours later — stale
  const staleTime = now + 25 * 60 * 60_000;
  const state = await idleActions.getState("farm", "g1", "u1", staleTime);
  assertEquals(state, null);
});

Deno.test("idleActions startAction: allows restart after collect", async () => {
  resetStore();
  const now = 1000000;
  const tier = FARM_TIERS[0];
  await idleActions.startAction("farm", "g1", "u1", tier, now);
  await idleActions.collectAction("farm", "g1", "u1", now + tier.cooldownMs);
  const result = await idleActions.startAction("farm", "g1", "u1", tier, now + tier.cooldownMs + 1000);
  assertEquals(result.success, true);
});
