import "../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../test/assert.ts";
import { sqlite } from "../../test/_mocks/sqlite.ts";
import {
  xpForLevel, levelFromXp, xpToNextLevel, totalXpForLevel,
  makeXpBar, xp, XP_AWARDS, _internals,
} from "./xp.ts";

function resetStore() {
  (sqlite as any)._reset();
}

Deno.test("xp _internals.xpKey: correct format", () => {
  assertEquals(_internals.xpKey("g1", "u1"), "xp:g1:u1");
});

Deno.test("xpForLevel: level 0 requires 0 XP", () => {
  assertEquals(xpForLevel(0), 0);
});

Deno.test("xpForLevel: level 1 requires 100 XP", () => {
  assertEquals(xpForLevel(1), 100);
});

Deno.test("xpForLevel: level 5 requires floor(100 * 5^1.5)", () => {
  assertEquals(xpForLevel(5), Math.floor(100 * Math.pow(5, 1.5)));
});

Deno.test("xpForLevel: level 10", () => {
  assertEquals(xpForLevel(10), Math.floor(100 * Math.pow(10, 1.5)));
});

Deno.test("levelFromXp: 0 XP is level 0", () => {
  assertEquals(levelFromXp(0), 0);
});

Deno.test("levelFromXp: 99 XP is still level 0", () => {
  assertEquals(levelFromXp(99), 0);
});

Deno.test("levelFromXp: 100 XP is level 1", () => {
  assertEquals(levelFromXp(100), 1);
});

Deno.test("levelFromXp: cumulative XP matches totalXpForLevel", () => {
  for (let lvl = 0; lvl <= 10; lvl++) {
    const total = totalXpForLevel(lvl);
    assertEquals(levelFromXp(total), lvl);
    // Just 1 short of next level
    if (lvl < 10) {
      assertEquals(levelFromXp(totalXpForLevel(lvl + 1) - 1), lvl);
    }
  }
});

Deno.test("xpToNextLevel: returns correct progress", () => {
  // At level 1 (100 XP), progress toward level 2
  const result = xpToNextLevel(150);
  assertEquals(result.current, 50); // 150 - 100 (xp at level 1)
  assertEquals(result.needed, xpForLevel(2));
});

Deno.test("xpToNextLevel: at level boundary", () => {
  const result = xpToNextLevel(100); // exactly level 1
  assertEquals(result.current, 0);
  assertEquals(result.needed, xpForLevel(2));
});

Deno.test("makeXpBar: renders bar", () => {
  const bar = makeXpBar(0, 10);
  assert(bar.includes("░░░░░░░░░░"));
  assert(bar.includes("0/100 XP"));
});

Deno.test("makeXpBar: partially filled", () => {
  const bar = makeXpBar(150, 10);
  assert(bar.includes("█"));
  assert(bar.includes("░"));
});

Deno.test("XP_AWARDS: has expected keys", () => {
  assert(XP_AWARDS.CASINO_WIN > 0);
  assert(XP_AWARDS.CASINO_LOSS > 0);
});

Deno.test("xp getOrCreate: creates default state", async () => {
  resetStore();
  const state = await xp.getOrCreate("g1", "u1");
  assertEquals(state.xp, 0);
  assertEquals(state.level, 0);
  assertEquals(state.totalXpEarned, 0);
  assertEquals(state.guildId, "g1");
  assertEquals(state.userId, "u1");
});

Deno.test("xp getOrCreate: returns existing state", async () => {
  resetStore();
  await xp.grantXp("g1", "u1", 200);
  const state = await xp.getOrCreate("g1", "u1");
  assertEquals(state.xp, 200);
});

Deno.test("xp grantXp: adds XP and computes level", async () => {
  resetStore();
  const result = await xp.grantXp("g1", "u1", 100);
  assertEquals(result.xpGained, 100);
  assertEquals(result.newLevel, 1);
  assertEquals(result.levelsGained, 1);
  assertEquals(result.state.xp, 100);
  assertEquals(result.state.totalXpEarned, 100);
});

Deno.test("xp grantXp: accumulates XP across calls", async () => {
  resetStore();
  await xp.grantXp("g1", "u1", 50);
  const result = await xp.grantXp("g1", "u1", 50);
  assertEquals(result.state.xp, 100);
  assertEquals(result.state.totalXpEarned, 100);
  assertEquals(result.newLevel, 1);
});

Deno.test("xp grantXp: detects multi-level gain", async () => {
  resetStore();
  // Level 1 = 100, level 2 ≈ 282 → total ≈ 382 for level 2
  const result = await xp.grantXp("g1", "u1", 500);
  assert(result.levelsGained >= 2);
  assert(result.newLevel >= 2);
});

Deno.test("xp getLevel: returns current level", async () => {
  resetStore();
  await xp.grantXp("g1", "u1", 100);
  const level = await xp.getLevel("g1", "u1");
  assertEquals(level, 1);
});

Deno.test("xp getLevel: returns 0 for new user", async () => {
  resetStore();
  const level = await xp.getLevel("g1", "u1");
  assertEquals(level, 0);
});

Deno.test("xp getLevels: batch fetch for multiple users", async () => {
  resetStore();
  await xp.grantXp("g1", "u1", 100);
  await xp.grantXp("g1", "u2", 500);
  const levels = await xp.getLevels("g1", ["u1", "u2", "u3"]);
  assertEquals(levels.get("u1"), 1);
  assert(levels.get("u2")! >= 2);
  assertEquals(levels.get("u3"), 0); // no XP, defaults to 0
});

Deno.test("makeXpBar: at 0% progress", () => {
  const bar = makeXpBar(0, 10);
  assert(bar.startsWith("░░░░░░░░░░"));
});

Deno.test("makeXpBar: at 100% (level boundary)", () => {
  // At exactly level 1 (100 XP), progress to next is 0/needed
  const bar = makeXpBar(100, 10);
  assert(bar.includes("░░░░░░░░░░"));
  assert(bar.includes("0/"));
});
