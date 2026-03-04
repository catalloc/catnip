import "../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../test/assert.ts";
import { sqlite } from "../../test/_mocks/sqlite.ts";
import {
  training, computeDerivedStats, trainingDuration,
  COMBAT_SKILLS, TRAINING_BASE_MS, TRAINING_SCALE_MS, TRAINING_XP,
  getSkillLabel, _internals,
} from "./training.ts";

function resetStore() {
  (sqlite as any)._reset();
}

Deno.test("_internals.statsKey: correct format", () => {
  assertEquals(_internals.statsKey("g1", "u1"), "combat-stats:g1:u1");
});

Deno.test("_internals.trainingKey: correct format", () => {
  assertEquals(_internals.trainingKey("g1", "u1"), "training:g1:u1");
});

Deno.test("getSkillLabel: returns human-readable labels", () => {
  assertEquals(getSkillLabel("strength"), "Strength");
  assertEquals(getSkillLabel("sword"), "Sword Mastery");
});

Deno.test("trainingDuration: base time for level 0", () => {
  assertEquals(trainingDuration(0), TRAINING_BASE_MS);
});

Deno.test("trainingDuration: scales with level", () => {
  assertEquals(trainingDuration(5), TRAINING_BASE_MS + 5 * TRAINING_SCALE_MS);
});

Deno.test("computeDerivedStats: default stats", () => {
  const stats = _internals.createDefaultStats("g1", "u1");
  const derived = computeDerivedStats(stats, 0);
  assertEquals(derived.maxHp, 50);
  assertEquals(derived.attack, 5);
  assertEquals(derived.defense, 2);
  assertEquals(derived.speed, 5);
  assertEquals(derived.unlockedSkills.length, 0);
});

Deno.test("computeDerivedStats: with stats and weapon", () => {
  const stats = _internals.createDefaultStats("g1", "u1");
  stats.strength = 5;
  stats.vitality = 3;
  stats.swordMastery = 4;
  const weapon = { id: "w1", name: "Iron Sword", damage: 8, weaponType: "sword" as const, requiredLevel: 5 };
  const derived = computeDerivedStats(stats, 10, weapon);
  // HP: 50 + 10*5 + 3*10 = 130
  assertEquals(derived.maxHp, 130);
  // Attack: 5 + 5*3 + 8 + 4*2 = 36
  assertEquals(derived.attack, 36);
  // Should unlock power-strike (strength >= 5)
  assert(derived.unlockedSkills.some((s) => s.id === "power-strike"));
});

Deno.test("computeDerivedStats: unlocks berserk at strength 10", () => {
  const stats = _internals.createDefaultStats("g1", "u1");
  stats.strength = 10;
  const derived = computeDerivedStats(stats, 0);
  assert(derived.unlockedSkills.some((s) => s.id === "berserk"));
  assert(derived.unlockedSkills.some((s) => s.id === "power-strike"));
});

Deno.test("training getStats: returns defaults", async () => {
  resetStore();
  const stats = await training.getStats("g1", "u1");
  assertEquals(stats.strength, 0);
  assertEquals(stats.swordMastery, 0);
});

Deno.test("training startTraining: creates session", async () => {
  resetStore();
  const now = 1000000;
  const result = await training.startTraining("g1", "u1", "strength", now);
  assertEquals(result.success, true);
  assertEquals(result.session?.skill, "strength");
  assertEquals(result.durationMs, TRAINING_BASE_MS);
});

Deno.test("training startTraining: rejects duplicate", async () => {
  resetStore();
  await training.startTraining("g1", "u1", "strength");
  const result = await training.startTraining("g1", "u1", "defense");
  assertEquals(result.success, false);
  assert(result.error?.includes("already have"));
});

Deno.test("training collectTraining: not ready", async () => {
  resetStore();
  const now = 1000000;
  await training.startTraining("g1", "u1", "strength", now);
  const result = await training.collectTraining("g1", "u1", now + 60_000);
  assertEquals(result.success, false);
  assert(result.error?.includes("isn't done"));
});

Deno.test("training collectTraining: success increments stat", async () => {
  resetStore();
  const now = 1000000;
  await training.startTraining("g1", "u1", "strength", now);
  const result = await training.collectTraining("g1", "u1", now + TRAINING_BASE_MS);
  assertEquals(result.success, true);
  assertEquals(result.skill, "strength");
  assertEquals(result.newLevel, 1);

  const stats = await training.getStats("g1", "u1");
  assertEquals(stats.strength, 1);
});

Deno.test("training collectTraining: double collect rejected", async () => {
  resetStore();
  const now = 1000000;
  await training.startTraining("g1", "u1", "strength", now);
  await training.collectTraining("g1", "u1", now + TRAINING_BASE_MS);
  const result = await training.collectTraining("g1", "u1", now + TRAINING_BASE_MS + 1000);
  assertEquals(result.success, false);
  assert(result.error?.includes("already collected"));
});

Deno.test("training collectTraining: no session", async () => {
  resetStore();
  const result = await training.collectTraining("g1", "u1");
  assertEquals(result.success, false);
  assert(result.error?.includes("don't have"));
});

Deno.test("training: weapon mastery trains correctly", async () => {
  resetStore();
  const now = 1000000;
  await training.startTraining("g1", "u1", "sword", now);
  const result = await training.collectTraining("g1", "u1", now + TRAINING_BASE_MS);
  assertEquals(result.success, true);
  assertEquals(result.newLevel, 1);

  const stats = await training.getStats("g1", "u1");
  assertEquals(stats.swordMastery, 1);
});

Deno.test("training: allows restart after collect", async () => {
  resetStore();
  const now = 1000000;
  await training.startTraining("g1", "u1", "strength", now);
  await training.collectTraining("g1", "u1", now + TRAINING_BASE_MS);
  const result = await training.startTraining("g1", "u1", "defense", now + TRAINING_BASE_MS + 1000);
  assertEquals(result.success, true);
});

Deno.test("training equipWeapon: sets weapon id", async () => {
  resetStore();
  await training.getOrCreateStats("g1", "u1");
  await training.equipWeapon("g1", "u1", "iron-sword");
  const stats = await training.getStats("g1", "u1");
  assertEquals(stats.equippedWeaponId, "iron-sword");
});

Deno.test("COMBAT_SKILLS: has 5 skills", () => {
  assertEquals(COMBAT_SKILLS.length, 5);
});
