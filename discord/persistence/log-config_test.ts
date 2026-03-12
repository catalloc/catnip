import "../../test/_mocks/env.ts";
import "../../test/_mocks/sqlite.ts";
import { assertEquals } from "../../test/assert.ts";
import { sqlite } from "../../test/_mocks/sqlite.ts";
import { logConfig, isPathMuted } from "./log-config.ts";

function resetStore() {
  (sqlite as any)._reset();
}

// --- isPathMuted ---

Deno.test("isPathMuted: exact match", () => {
  assertEquals(isPathMuted("cmd:games", ["cmd:games"]), true);
});

Deno.test("isPathMuted: prefix match", () => {
  assertEquals(isPathMuted("cmd:games:coinflip", ["cmd:games"]), true);
});

Deno.test("isPathMuted: no match", () => {
  assertEquals(isPathMuted("cmd:ping", ["cmd:games"]), false);
});

Deno.test("isPathMuted: partial name is not a prefix match", () => {
  // "cmd:game" should NOT match "cmd:games" — prefix requires colon boundary
  assertEquals(isPathMuted("cmd:games", ["cmd:game"]), false);
});

Deno.test("isPathMuted: empty muted list", () => {
  assertEquals(isPathMuted("cmd:anything", []), false);
});

Deno.test("isPathMuted: cron path", () => {
  assertEquals(isPathMuted("cron:reminders", ["cron:reminders"]), true);
});

// --- logConfig.getMutedPaths ---

Deno.test("getMutedPaths: returns empty array when no config", async () => {
  resetStore();
  const paths = await logConfig.getMutedPaths();
  assertEquals(paths, []);
});

// --- logConfig.addMutedPath ---

Deno.test("addMutedPath: adds a path", async () => {
  resetStore();
  const added = await logConfig.addMutedPath("cmd:games");
  assertEquals(added, true);
  const paths = await logConfig.getMutedPaths();
  assertEquals(paths, ["cmd:games"]);
});

Deno.test("addMutedPath: rejects duplicate", async () => {
  resetStore();
  await logConfig.addMutedPath("cmd:games");
  const added = await logConfig.addMutedPath("cmd:games");
  assertEquals(added, false);
});

Deno.test("addMutedPath: allows multiple paths", async () => {
  resetStore();
  await logConfig.addMutedPath("cmd:games");
  await logConfig.addMutedPath("cron:reminders");
  const paths = await logConfig.getMutedPaths();
  assertEquals(paths.length, 2);
  assertEquals(paths.includes("cmd:games"), true);
  assertEquals(paths.includes("cron:reminders"), true);
});

// --- logConfig.removeMutedPath ---

Deno.test("removeMutedPath: removes existing path", async () => {
  resetStore();
  await logConfig.addMutedPath("cmd:games");
  const removed = await logConfig.removeMutedPath("cmd:games");
  assertEquals(removed, true);
  const paths = await logConfig.getMutedPaths();
  assertEquals(paths, []);
});

Deno.test("removeMutedPath: returns false for non-existent path", async () => {
  resetStore();
  const removed = await logConfig.removeMutedPath("cmd:nope");
  assertEquals(removed, false);
});

Deno.test("removeMutedPath: removes only specified path", async () => {
  resetStore();
  await logConfig.addMutedPath("cmd:games");
  await logConfig.addMutedPath("cmd:ping");
  await logConfig.removeMutedPath("cmd:games");
  const paths = await logConfig.getMutedPaths();
  assertEquals(paths, ["cmd:ping"]);
});
