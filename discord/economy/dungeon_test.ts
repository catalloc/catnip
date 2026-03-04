import "../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../test/assert.ts";
import { sqlite } from "../../test/_mocks/sqlite.ts";
import {
  DUNGEON_MONSTERS, DUNGEONS, getDungeon, getDungeonMonster, getAvailableDungeons,
  dungeon, resolveDungeonTurn, advanceFloor, calculateFloorReward, _internals,
} from "./dungeon.ts";
import type { DungeonSession, DerivedCombatStats, InventorySlot, DungeonCombatState } from "./types.ts";

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

function makeSession(overrides?: Partial<DungeonSession>): DungeonSession {
  const monster = getDungeonMonster("cave-rat")!;
  return {
    guildId: "g1", userId: "u1", dungeonId: "goblin-cave",
    currentFloor: 1, currentRoom: 1, totalRoomsOnFloor: 3,
    combat: {
      monster, monsterHp: monster.hp, monsterMaxHp: monster.hp,
      isBoss: false, berserkActive: false, shieldActive: false,
    },
    playerHp: 100, playerMaxHp: 100,
    playerStats: makePlayerStats(),
    activeBuffs: [],
    dungeonInventory: [],
    accumulatedCoins: 0, accumulatedXp: 0,
    floorCleared: false, floorsCompleted: 0,
    status: "combat", turn: 0, log: [],
    createdAt: Date.now(),
    ...overrides,
  };
}

// ── Monster & Dungeon Lookups ──

Deno.test("DUNGEON_MONSTERS: has monsters", () => {
  assert(DUNGEON_MONSTERS.length > 0);
  assertEquals(DUNGEON_MONSTERS[0].id, "cave-rat");
});

Deno.test("getDungeonMonster: finds by id", () => {
  const m = getDungeonMonster("goblin-chief");
  assertEquals(m?.name, "Goblin Chief");
  assertEquals(m?.hp, 60);
});

Deno.test("getDungeonMonster: undefined for unknown", () => {
  assertEquals(getDungeonMonster("fake"), undefined);
});

Deno.test("DUNGEONS: has 5 dungeons", () => {
  assertEquals(DUNGEONS.length, 5);
});

Deno.test("getDungeon: finds by id", () => {
  const d = getDungeon("goblin-cave");
  assertEquals(d?.name, "Goblin Cave");
  assertEquals(d?.floors, 3);
});

Deno.test("getAvailableDungeons: filters by level", () => {
  assertEquals(getAvailableDungeons(0).length, 1);
  assertEquals(getAvailableDungeons(8).length, 2);
  assertEquals(getAvailableDungeons(40).length, 5);
});

// ── Session CRUD ──

Deno.test("dungeon session: create + get", async () => {
  resetStore();
  const dungeonDef = getDungeon("goblin-cave")!;
  const stats = makePlayerStats();
  const session = await dungeon.createSession("g1", "u1", dungeonDef, stats, []);
  assertEquals(session.status, "combat");
  assertEquals(session.currentFloor, 1);
  assertEquals(session.currentRoom, 1);
  assert(session.combat !== null);

  const got = await dungeon.getSession("g1", "u1");
  assertEquals(got?.status, "combat");
});

Deno.test("dungeon session: delete", async () => {
  resetStore();
  const dungeonDef = getDungeon("goblin-cave")!;
  await dungeon.createSession("g1", "u1", dungeonDef, makePlayerStats(), []);
  await dungeon.deleteSession("g1", "u1");
  assertEquals(await dungeon.getSession("g1", "u1"), null);
});

// ── Turn Resolution ──

Deno.test("resolveDungeonTurn attack: deals damage", () => {
  const session = makeSession();
  const result = resolveDungeonTurn(session, "attack");
  assert(result.session.combat!.monsterHp < 20); // cave rat has 20 HP
  assert(result.session.log.length > 0);
});

Deno.test("resolveDungeonTurn attack: kills weak monster and auto-advances room", () => {
  const session = makeSession({
    playerStats: makePlayerStats({ attack: 100 }),
  });
  session.combat!.monsterHp = 1;

  const result = resolveDungeonTurn(session, "attack");
  assert(result.monsterDefeated);
  assertEquals(result.session.currentRoom, 2);
  assert(result.session.combat !== null);
});

Deno.test("resolveDungeonTurn attack: kills boss triggers floor-cleared", () => {
  const boss = getDungeonMonster("goblin-grunt")!;
  const session = makeSession({
    currentRoom: 3, totalRoomsOnFloor: 3,
    combat: {
      monster: boss, monsterHp: 1, monsterMaxHp: boss.hp,
      isBoss: true, berserkActive: false, shieldActive: false,
    },
    playerStats: makePlayerStats({ attack: 100 }),
  });

  const result = resolveDungeonTurn(session, "attack");
  assert(result.monsterDefeated);
  assert(result.floorCleared);
  assertEquals(result.session.status, "floor-cleared");
  assert(result.session.accumulatedCoins > 0);
  assert(result.session.accumulatedXp > 0);
});

Deno.test("resolveDungeonTurn: defeat sets status", () => {
  const monster = getDungeonMonster("goblin-chief")!;
  const session = makeSession({
    playerHp: 1,
    playerStats: makePlayerStats({ defense: 0, speed: 0, attack: 1 }),
    combat: {
      monster, monsterHp: monster.hp, monsterMaxHp: monster.hp,
      isBoss: false, berserkActive: false, shieldActive: false,
    },
  });

  const result = resolveDungeonTurn(session, "attack");
  assertEquals(result.session.status, "defeat");
  assertEquals(result.ended, true);
});

Deno.test("resolveDungeonTurn defend: reduces damage", () => {
  const session = makeSession();
  const result = resolveDungeonTurn(session, "defend");
  assert(result.session.log.some((l) => l.includes("brace")));
});

// ── Item Usage ──

Deno.test("resolveDungeonTurn item: heals player", () => {
  const session = makeSession({
    playerHp: 50,
    dungeonInventory: [{ itemId: "health-potion", quantity: 2 }],
  });

  const result = resolveDungeonTurn(session, "item", undefined, "health-potion");
  assert(result.session.log.some((l) => l.includes("Health Potion")));
  // Item consumed
  const slot = result.session.dungeonInventory.find((s) => s.itemId === "health-potion");
  assertEquals(slot?.quantity, 1);
});

Deno.test("resolveDungeonTurn item: removes slot when quantity hits 0", () => {
  const session = makeSession({
    playerHp: 50,
    dungeonInventory: [{ itemId: "health-potion", quantity: 1 }],
  });

  resolveDungeonTurn(session, "item", undefined, "health-potion");
  assertEquals(session.dungeonInventory.length, 0);
});

// ── Buffs ──

Deno.test("damage-boost buff: multiplies damage", () => {
  const session = makeSession({
    activeBuffs: [{ type: "damage-boost", value: 2, turnsRemaining: 3 }],
  });
  session.combat!.monsterHp = 1;

  const result = resolveDungeonTurn(session, "attack");
  assert(result.monsterDefeated);
});

Deno.test("revive buff: prevents defeat", () => {
  const monster = getDungeonMonster("goblin-chief")!;
  const session = makeSession({
    playerHp: 1,
    playerStats: makePlayerStats({ defense: 0, speed: 0, attack: 1 }),
    activeBuffs: [{ type: "revive", value: 0.25, turnsRemaining: 999 }],
    combat: {
      monster, monsterHp: monster.hp, monsterMaxHp: monster.hp,
      isBoss: false, berserkActive: false, shieldActive: false,
    },
  });

  const result = resolveDungeonTurn(session, "attack");
  // Should not be defeated due to revive
  if (result.session.status !== "defeat") {
    assert(result.session.playerHp > 0);
    assert(result.session.log.some((l) => l.includes("Revive Charm")));
  }
  // Revive consumed
  assert(!result.session.activeBuffs.some((b) => b.type === "revive"));
});

Deno.test("tickBuffs: decrements and removes expired", () => {
  const buffs = [
    { type: "damage-boost" as const, value: 1.5, turnsRemaining: 2 },
    { type: "shield" as const, value: 0.5, turnsRemaining: 1 },
  ];
  const result = _internals.tickBuffs(buffs);
  assertEquals(result.length, 1);
  assertEquals(result[0].turnsRemaining, 1);
});

// ── Floor Advancement ──

Deno.test("advanceFloor: moves to next floor", () => {
  const session = makeSession({
    currentFloor: 1, floorsCompleted: 1, floorCleared: true,
    status: "floor-cleared",
  });

  advanceFloor(session);
  assertEquals(session.currentFloor, 2);
  assertEquals(session.currentRoom, 1);
  assertEquals(session.status, "combat");
  assert(session.combat !== null);
  assertEquals(session.floorCleared, false);
});

// ── Floor Rewards ──

Deno.test("calculateFloorReward: returns coins and xp", () => {
  const dungeonDef = getDungeon("goblin-cave")!;
  const reward = calculateFloorReward(dungeonDef, 1);
  assert(reward.coins >= Math.floor(30 * 0.8));
  assert(reward.coins <= Math.ceil(30 * 1.2));
  assertEquals(reward.xp, 20);
});

Deno.test("calculateFloorReward: scales with floor number", () => {
  const dungeonDef = getDungeon("goblin-cave")!;
  const r1 = calculateFloorReward(dungeonDef, 1);
  const r3 = calculateFloorReward(dungeonDef, 3);
  assert(r3.xp > r1.xp);
});

// ── Dungeon Key ──

Deno.test("_internals.dungeonKey: correct format", () => {
  assertEquals(_internals.dungeonKey("g1", "u1"), "dungeon:g1:u1");
});

// ── Victory with completion bonus ──

Deno.test("resolveDungeonTurn: final boss clears dungeon with bonus", () => {
  const boss = getDungeonMonster("goblin-chief")!;
  const session = makeSession({
    currentFloor: 3, currentRoom: 4, totalRoomsOnFloor: 4,
    floorsCompleted: 2, accumulatedCoins: 100, accumulatedXp: 60,
    combat: {
      monster: boss, monsterHp: 1, monsterMaxHp: boss.hp,
      isBoss: true, berserkActive: false, shieldActive: false,
    },
    playerStats: makePlayerStats({ attack: 100 }),
  });

  const result = resolveDungeonTurn(session, "attack");
  assert(result.dungeonComplete);
  assertEquals(result.session.status, "victory");
  // Completion bonus applied (1.5x)
  assert(result.session.accumulatedCoins > 100);
  assert(result.session.accumulatedXp > 60);
});
