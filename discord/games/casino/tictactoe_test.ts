import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { tictactoe, checkWin, isBoardFull, formatBoard, _internals } from "./tictactoe.ts";

function resetStore() {
  (sqlite as any)._reset();
}

// ── Pure function tests ──

Deno.test("checkWin: top row", () => {
  const board = [1, 1, 1, 0, 0, 0, 0, 0, 0];
  assert(checkWin(board, 1));
  assert(!checkWin(board, 2));
});

Deno.test("checkWin: middle row", () => {
  const board = [0, 0, 0, 2, 2, 2, 0, 0, 0];
  assert(checkWin(board, 2));
});

Deno.test("checkWin: bottom row", () => {
  const board = [0, 0, 0, 0, 0, 0, 1, 1, 1];
  assert(checkWin(board, 1));
});

Deno.test("checkWin: left column", () => {
  const board = [1, 0, 0, 1, 0, 0, 1, 0, 0];
  assert(checkWin(board, 1));
});

Deno.test("checkWin: center column", () => {
  const board = [0, 2, 0, 0, 2, 0, 0, 2, 0];
  assert(checkWin(board, 2));
});

Deno.test("checkWin: right column", () => {
  const board = [0, 0, 1, 0, 0, 1, 0, 0, 1];
  assert(checkWin(board, 1));
});

Deno.test("checkWin: diagonal top-left to bottom-right", () => {
  const board = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  assert(checkWin(board, 1));
});

Deno.test("checkWin: diagonal top-right to bottom-left", () => {
  const board = [0, 0, 2, 0, 2, 0, 2, 0, 0];
  assert(checkWin(board, 2));
});

Deno.test("checkWin: no win on empty board", () => {
  const board = Array(9).fill(0);
  assert(!checkWin(board, 1));
  assert(!checkWin(board, 2));
});

Deno.test("checkWin: two in a row is not a win", () => {
  const board = [1, 1, 0, 0, 0, 0, 0, 0, 0];
  assert(!checkWin(board, 1));
});

Deno.test("isBoardFull: empty board", () => {
  assert(!isBoardFull(Array(9).fill(0)));
});

Deno.test("isBoardFull: full board", () => {
  assert(isBoardFull([1, 2, 1, 2, 1, 2, 1, 2, 1]));
});

Deno.test("isBoardFull: partial board", () => {
  assert(!isBoardFull([1, 2, 1, 0, 1, 2, 1, 2, 1]));
});

Deno.test("formatBoard: contains X and O markers", () => {
  const board = [1, 0, 2, 0, 0, 0, 0, 0, 0];
  const formatted = formatBoard(board);
  assert(formatted.includes(":x:"));
  assert(formatted.includes(":o:"));
  assert(formatted.includes(":black_large_square:"));
});

Deno.test("formatBoard: has 3 rows", () => {
  const board = Array(9).fill(0);
  const formatted = formatBoard(board);
  assertEquals(formatted.split("\n").length, 3);
});

Deno.test("WIN_LINES: has 8 lines", () => {
  assertEquals(_internals.WIN_LINES.length, 8);
});

Deno.test("WIN_LINES: each line has 3 indices", () => {
  for (const line of _internals.WIN_LINES) {
    assertEquals(line.length, 3);
    for (const idx of line) {
      assert(idx >= 0 && idx <= 8);
    }
  }
});

// ── Session tests ──

Deno.test("session: create and retrieve", async () => {
  resetStore();
  const session = await tictactoe.createSession("g1", "u1", "u2", "ch1", 100);
  assertEquals(session.status, "pending");
  assertEquals(session.currentPlayer, 1);
  assertEquals(session.board.length, 9);
  assert(session.board.every((c) => c === 0));

  const retrieved = await tictactoe.getSession("g1", "u1");
  assert(retrieved !== null);
  assertEquals(retrieved!.targetId, "u2");
});

Deno.test("session: update persists", async () => {
  resetStore();
  const session = await tictactoe.createSession("g1", "u1", "u2", "ch1", 100);
  session.board[4] = 1;
  session.currentPlayer = 2;
  session.status = "playing";
  await tictactoe.updateSession(session);

  const retrieved = await tictactoe.getSession("g1", "u1");
  assertEquals(retrieved!.board[4], 1);
  assertEquals(retrieved!.currentPlayer, 2);
});

Deno.test("session: delete removes", async () => {
  resetStore();
  await tictactoe.createSession("g1", "u1", "u2", "ch1", 100);
  await tictactoe.deleteSession("g1", "u1");
  assertEquals(await tictactoe.getSession("g1", "u1"), null);
});

Deno.test("session: expired session returns null", async () => {
  resetStore();
  const session = await tictactoe.createSession("g1", "u1", "u2", "ch1", 100);
  session.createdAt = Date.now() - _internals.SESSION_TTL_MS - 1000;
  await tictactoe.updateSession(session);

  assertEquals(await tictactoe.getSession("g1", "u1"), null);
});
