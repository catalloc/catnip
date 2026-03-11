import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { generateGrid, calculateMultiplier, revealCell, formatGrid, mines, GRID_SIZE, MAX_MINES, _internals } from "./mines.ts";
import type { MinesSession } from "../types.ts";

function resetStore() {
  (sqlite as any)._reset();
}

Deno.test("mines: generateGrid creates correct size", () => {
  const grid = generateGrid(5);
  assertEquals(grid.length, GRID_SIZE);
});

Deno.test("mines: generateGrid places correct number of mines", () => {
  for (let count = 1; count <= 10; count++) {
    const grid = generateGrid(count);
    const mineCount = grid.filter(Boolean).length;
    assertEquals(mineCount, count);
  }
});

Deno.test("mines: calculateMultiplier starts at 1.0", () => {
  assertEquals(calculateMultiplier(5, 0), 1.0);
});

Deno.test("mines: calculateMultiplier increases with picks", () => {
  let prev = 0;
  for (let i = 0; i <= 5; i++) {
    const m = calculateMultiplier(10, i);
    assert(m > prev, `Multiplier at ${i} picks should increase`);
    prev = m;
  }
});

Deno.test("mines: more mines = higher multiplier", () => {
  const low = calculateMultiplier(3, 3);
  const high = calculateMultiplier(15, 3);
  assert(high > low, "More mines should give higher multiplier for same picks");
});

Deno.test("mines: revealCell safe pick", () => {
  const session: MinesSession = {
    guildId: "g1", userId: "u1", bet: 100, mineCount: 5,
    grid: new Array(GRID_SIZE).fill(false),
    revealed: new Array(GRID_SIZE).fill(false),
    safePicks: 0, currentMultiplier: 1.0,
    status: "playing", createdAt: Date.now(),
  };
  // All cells are safe (no mines)
  const result = revealCell(session, 0);
  assert(result.safe);
  assert(result.multiplier > 1.0);
  assertEquals(session.safePicks, 1);
  assertEquals(session.revealed[0], true);
});

Deno.test("mines: revealCell mine hit", () => {
  const grid = new Array(GRID_SIZE).fill(false);
  grid[0] = true; // mine at index 0
  const session: MinesSession = {
    guildId: "g1", userId: "u1", bet: 100, mineCount: 1,
    grid, revealed: new Array(GRID_SIZE).fill(false),
    safePicks: 0, currentMultiplier: 1.0,
    status: "playing", createdAt: Date.now(),
  };
  const result = revealCell(session, 0);
  assert(!result.safe);
  assertEquals(result.multiplier, 0);
});

Deno.test("mines: formatGrid shows correct symbols", () => {
  const session: MinesSession = {
    guildId: "g1", userId: "u1", bet: 100, mineCount: 1,
    grid: [true, ...new Array(GRID_SIZE - 1).fill(false)],
    revealed: [false, true, ...new Array(GRID_SIZE - 2).fill(false)],
    safePicks: 1, currentMultiplier: 1.5,
    status: "playing", createdAt: Date.now(),
  };
  const normal = formatGrid(session);
  assert(normal.includes(":gem:"), "Should show gem for revealed safe cell");
  assert(normal.includes(":white_large_square:"), "Should show square for unrevealed");

  const revealed = formatGrid(session, true);
  assert(revealed.includes(":boom:"), "Should show boom for mine when reveal all");
});

Deno.test("mines session: create and retrieve", async () => {
  resetStore();
  const session = await mines.createSession("g1", "u1", 100, 5);
  assertEquals(session.bet, 100);
  assertEquals(session.mineCount, 5);
  assertEquals(session.grid.filter(Boolean).length, 5);
  assertEquals(session.safePicks, 0);

  const retrieved = await mines.getSession("g1", "u1");
  assert(retrieved !== null);
  assertEquals(retrieved!.bet, 100);
});

Deno.test("mines session: delete", async () => {
  resetStore();
  await mines.createSession("g1", "u1", 50, 3);
  await mines.deleteSession("g1", "u1");
  assertEquals(await mines.getSession("g1", "u1"), null);
});

Deno.test("mines session: expired returns null", async () => {
  resetStore();
  const session = await mines.createSession("g1", "u1", 50, 3);
  session.createdAt = Date.now() - _internals.SESSION_TTL_MS - 1000;
  await mines.updateSession(session);
  assertEquals(await mines.getSession("g1", "u1"), null);
});
