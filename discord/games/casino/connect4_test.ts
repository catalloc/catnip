import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { connect4, createBoard, dropPiece, checkWin, isBoardFull, formatBoard, ROWS, COLS, _internals } from "./connect4.ts";

function resetStore() {
  (sqlite as any)._reset();
}

// ── Pure function tests ──

Deno.test("createBoard: returns 6x7 grid of zeros", () => {
  const board = createBoard();
  assertEquals(board.length, ROWS);
  for (const row of board) {
    assertEquals(row.length, COLS);
    assert(row.every((c) => c === 0));
  }
});

Deno.test("dropPiece: drops to bottom of empty column", () => {
  const board = createBoard();
  const row = dropPiece(board, 3, 1);
  assertEquals(row, ROWS - 1);
  assertEquals(board[ROWS - 1][3], 1);
});

Deno.test("dropPiece: stacks on existing pieces", () => {
  const board = createBoard();
  dropPiece(board, 3, 1);
  const row = dropPiece(board, 3, 2);
  assertEquals(row, ROWS - 2);
  assertEquals(board[ROWS - 2][3], 2);
});

Deno.test("dropPiece: returns -1 when column is full", () => {
  const board = createBoard();
  for (let i = 0; i < ROWS; i++) dropPiece(board, 0, 1);
  const row = dropPiece(board, 0, 2);
  assertEquals(row, -1);
});

Deno.test("checkWin: horizontal win", () => {
  const board = createBoard();
  for (let c = 0; c < 4; c++) board[5][c] = 1;
  assert(checkWin(board, 1));
  assert(!checkWin(board, 2));
});

Deno.test("checkWin: vertical win", () => {
  const board = createBoard();
  for (let r = 2; r < 6; r++) board[r][0] = 2;
  assert(checkWin(board, 2));
});

Deno.test("checkWin: diagonal down-right win", () => {
  const board = createBoard();
  for (let i = 0; i < 4; i++) board[i][i] = 1;
  assert(checkWin(board, 1));
});

Deno.test("checkWin: diagonal down-left win", () => {
  const board = createBoard();
  for (let i = 0; i < 4; i++) board[i][6 - i] = 1;
  assert(checkWin(board, 1));
});

Deno.test("checkWin: no win on empty board", () => {
  const board = createBoard();
  assert(!checkWin(board, 1));
  assert(!checkWin(board, 2));
});

Deno.test("checkWin: three in a row is not a win", () => {
  const board = createBoard();
  for (let c = 0; c < 3; c++) board[5][c] = 1;
  assert(!checkWin(board, 1));
});

Deno.test("isBoardFull: empty board is not full", () => {
  assert(!isBoardFull(createBoard()));
});

Deno.test("isBoardFull: full board is full", () => {
  const board = createBoard();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      board[r][c] = (r + c) % 2 === 0 ? 1 : 2;
    }
  }
  assert(isBoardFull(board));
});

Deno.test("formatBoard: contains column numbers", () => {
  const board = createBoard();
  const formatted = formatBoard(board);
  assert(formatted.includes(":one:"));
  assert(formatted.includes(":seven:"));
});

Deno.test("formatBoard: shows player pieces", () => {
  const board = createBoard();
  board[5][0] = 1;
  board[5][1] = 2;
  const formatted = formatBoard(board);
  assert(formatted.includes(":red_circle:"));
  assert(formatted.includes(":yellow_circle:"));
});

// ── Session tests ──

Deno.test("session: create and retrieve", async () => {
  resetStore();
  const session = await connect4.createSession("g1", "u1", "u2", "ch1", 100);
  assertEquals(session.status, "pending");
  assertEquals(session.currentPlayer, 1);
  assertEquals(session.board.length, ROWS);

  const retrieved = await connect4.getSession("g1", "u1");
  assert(retrieved !== null);
  assertEquals(retrieved!.targetId, "u2");
});

Deno.test("session: update persists", async () => {
  resetStore();
  const session = await connect4.createSession("g1", "u1", "u2", "ch1", 100);
  session.status = "playing";
  session.currentPlayer = 2;
  await connect4.updateSession(session);

  const retrieved = await connect4.getSession("g1", "u1");
  assertEquals(retrieved!.status, "playing");
  assertEquals(retrieved!.currentPlayer, 2);
});

Deno.test("session: delete removes", async () => {
  resetStore();
  await connect4.createSession("g1", "u1", "u2", "ch1", 100);
  await connect4.deleteSession("g1", "u1");
  assertEquals(await connect4.getSession("g1", "u1"), null);
});

Deno.test("session: expired session returns null", async () => {
  resetStore();
  const session = await connect4.createSession("g1", "u1", "u2", "ch1", 100);
  session.createdAt = Date.now() - _internals.SESSION_TTL_MS - 1000;
  await connect4.updateSession(session);

  assertEquals(await connect4.getSession("g1", "u1"), null);
});
