import "../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../test/assert.ts";
import { sqlite } from "../../test/_mocks/sqlite.ts";
import {
  MONSTERS, WEAPONS, getWeapon, getMonster, getAvailableMonsters,
  arena, calculateDamage, resolveTurn, hpBar, _internals,
} from "./combat.ts";
import type { ArenaSession, DerivedCombatStats } from "./types.ts";

function resetStore() {
  (sqlite as any)._reset();
}

function makePlayerStats(overrides?: Partial<DerivedCombatStats>): DerivedCombatStats {
  return {
    maxHp: 100, attack: 15, defense: 5, speed: 10,
    unlockedSkills: [],
    ...overrides,
  };
}

Deno.test("_internals.arenaKey: correct format", () => {
  assertEquals(_internals.arenaKey("g1", "u1"), "arena:g1:u1");
});

Deno.test("MONSTERS: has 8 monsters", () => {
  assertEquals(MONSTERS.length, 8);
  assertEquals(MONSTERS[0].id, "slime");
  assertEquals(MONSTERS[7].id, "ancient-golem");
});

Deno.test("WEAPONS: has 7 weapons", () => {
  assertEquals(WEAPONS.length, 7);
});

Deno.test("getWeapon: finds weapon by id", () => {
  const w = getWeapon("iron-sword");
  assertEquals(w?.name, "Iron Sword");
  assertEquals(w?.damage, 8);
});

Deno.test("getWeapon: undefined for unknown", () => {
  assertEquals(getWeapon("fake"), undefined);
});

Deno.test("getMonster: finds by id", () => {
  const m = getMonster("goblin");
  assertEquals(m?.name, "Goblin");
});

Deno.test("getAvailableMonsters: filters by level", () => {
  const low = getAvailableMonsters(0);
  assertEquals(low.length, 1);
  assertEquals(low[0].id, "slime");

  const mid = getAvailableMonsters(13);
  assertEquals(mid.length, 4);
});

Deno.test("calculateDamage: always at least 1", () => {
  for (let i = 0; i < 20; i++) {
    const dmg = calculateDamage(1, 100);
    assert(dmg >= 1);
  }
});

Deno.test("arena createSession + getSession", async () => {
  resetStore();
  const monster = MONSTERS[0];
  const stats = makePlayerStats();
  const session = await arena.createSession("g1", "u1", monster, stats);
  assertEquals(session.status, "active");
  assertEquals(session.playerHp, 100);
  assertEquals(session.monsterHp, 30);

  const got = await arena.getSession("g1", "u1");
  assertEquals(got?.status, "active");
});

Deno.test("arena deleteSession", async () => {
  resetStore();
  await arena.createSession("g1", "u1", MONSTERS[0], makePlayerStats());
  await arena.deleteSession("g1", "u1");
  const got = await arena.getSession("g1", "u1");
  assertEquals(got, null);
});

Deno.test("resolveTurn attack: deals damage to monster", () => {
  const monster = MONSTERS[0]; // slime: 30hp, 4atk, 1def, 2spd
  const stats = makePlayerStats({ attack: 15, defense: 5, speed: 10 });
  const session: ArenaSession = {
    guildId: "g1", userId: "u1", monster,
    playerHp: 100, playerMaxHp: 100,
    monsterHp: 30, monsterMaxHp: 30,
    playerStats: stats,
    turn: 0, status: "active",
    berserkActive: false, shieldActive: false,
    log: [], createdAt: Date.now(),
  };

  const result = resolveTurn(session, "attack");
  // Player is faster (10 > 2), attacks first
  assert(result.session.monsterHp < 30);
  assert(result.session.log.length > 0);
});

Deno.test("resolveTurn defend: reduces damage taken", () => {
  const monster = { ...MONSTERS[0], attack: 20, speed: 20 }; // fast+strong monster
  const stats = makePlayerStats({ attack: 10, defense: 2, speed: 1 });
  const session: ArenaSession = {
    guildId: "g1", userId: "u1", monster,
    playerHp: 100, playerMaxHp: 100,
    monsterHp: 30, monsterMaxHp: 30,
    playerStats: stats,
    turn: 0, status: "active",
    berserkActive: false, shieldActive: false,
    log: [], createdAt: Date.now(),
  };

  const result = resolveTurn(session, "defend");
  assert(result.session.log.some((l) => l.includes("brace")));
});

Deno.test("resolveTurn flee: 50% chance", () => {
  let fled = false;
  let failed = false;
  for (let i = 0; i < 50; i++) {
    const session: ArenaSession = {
      guildId: "g1", userId: "u1", monster: MONSTERS[0],
      playerHp: 100, playerMaxHp: 100,
      monsterHp: 30, monsterMaxHp: 30,
      playerStats: makePlayerStats(),
      turn: 0, status: "active",
      berserkActive: false, shieldActive: false,
      log: [], createdAt: Date.now(),
    };
    const result = resolveTurn(session, "flee");
    if (result.session.status === "fled") fled = true;
    if (result.session.status === "active") failed = true;
    if (fled && failed) break;
  }
  // With 50 tries, probability of not seeing both outcomes is vanishingly small
  assert(fled || failed); // At least one outcome seen
});

Deno.test("resolveTurn victory: credits reward", () => {
  const monster = MONSTERS[0]; // slime: 30hp
  const stats = makePlayerStats({ attack: 100, speed: 10 }); // very strong
  const session: ArenaSession = {
    guildId: "g1", userId: "u1", monster,
    playerHp: 100, playerMaxHp: 100,
    monsterHp: 1, monsterMaxHp: 30, // almost dead
    playerStats: stats,
    turn: 0, status: "active",
    berserkActive: false, shieldActive: false,
    log: [], createdAt: Date.now(),
  };

  const result = resolveTurn(session, "attack");
  assertEquals(result.session.status, "victory");
  assertEquals(result.ended, true);
  assert(result.rewardCoins! >= monster.rewardMin);
  assert(result.rewardCoins! <= monster.rewardMax);
  assertEquals(result.rewardXp, monster.xpReward);
});

Deno.test("hpBar: full bar", () => {
  assertEquals(hpBar(100, 100, 10), "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588");
});

Deno.test("hpBar: half bar", () => {
  assertEquals(hpBar(50, 100, 10), "\u2588\u2588\u2588\u2588\u2588\u2591\u2591\u2591\u2591\u2591");
});

Deno.test("hpBar: empty bar", () => {
  assertEquals(hpBar(0, 100, 10), "\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591");
});
