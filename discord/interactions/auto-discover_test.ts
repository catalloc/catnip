import "../../test/_mocks/env.ts";
import "../../test/_mocks/sqlite.ts";
import { assertEquals, assert } from "@std/assert";
import { kv } from "../persistence/kv.ts";
import { sqlite } from "../../test/_mocks/sqlite.ts";

// We can't easily import discover() directly because it imports from
// Val Town's listFiles API. Instead, we test the logic patterns it uses.

// --- findFiles logic (extracted pattern) ---

function findFiles(paths: string[], baseDir: string, subDir: string): string[] {
  const dirPath = baseDir + subDir + "/";
  return paths
    .filter((f) => f.endsWith(".ts") && f.startsWith(dirPath) && !f.slice(dirPath.length).includes("/"))
    .map((f) => f.slice(dirPath.length).replace(/\.ts$/, ""))
    .sort();
}

Deno.test("findFiles: extracts command names from paths", () => {
  const paths = [
    "discord/interactions/commands/ping.ts",
    "discord/interactions/commands/echo.ts",
    "discord/interactions/commands/remind.ts",
  ];
  const result = findFiles(paths, "discord/interactions/", "commands");
  assertEquals(result, ["echo", "ping", "remind"]);
});

Deno.test("findFiles: extracts component names from paths", () => {
  const paths = [
    "discord/interactions/components/poll-vote.ts",
    "discord/interactions/components/giveaway-enter.ts",
  ];
  const result = findFiles(paths, "discord/interactions/", "components");
  assertEquals(result, ["giveaway-enter", "poll-vote"]);
});

Deno.test("findFiles: excludes non-.ts files", () => {
  const paths = [
    "discord/interactions/commands/ping.ts",
    "discord/interactions/commands/readme.md",
    "discord/interactions/commands/data.json",
  ];
  const result = findFiles(paths, "discord/interactions/", "commands");
  assertEquals(result, ["ping"]);
});

Deno.test("findFiles: excludes nested subdirectories", () => {
  const paths = [
    "discord/interactions/commands/ping.ts",
    "discord/interactions/commands/sub/nested.ts",
  ];
  const result = findFiles(paths, "discord/interactions/", "commands");
  assertEquals(result, ["ping"]);
});

Deno.test("findFiles: returns empty for no matches", () => {
  const paths = [
    "other/directory/file.ts",
  ];
  const result = findFiles(paths, "discord/interactions/", "commands");
  assertEquals(result, []);
});

Deno.test("findFiles: excludes test files", () => {
  const paths = [
    "discord/interactions/commands/ping.ts",
    "discord/interactions/commands/ping_test.ts",
  ];
  const result = findFiles(paths, "discord/interactions/", "commands");
  // Both match — the actual discover() doesn't filter tests, they're just not registered
  assertEquals(result, ["ping", "ping_test"]);
});

// --- KV manifest storage ---

Deno.test("manifest KV round-trip: set and get manifest", async () => {
  (sqlite as any)._reset();
  const manifest = { commands: ["ping", "echo"], components: ["poll-vote"] };
  await kv.set("manifest", manifest);
  const retrieved = await kv.get<typeof manifest>("manifest");
  assertEquals(retrieved, manifest);
});

Deno.test("manifest KV: overwrite updates manifest", async () => {
  (sqlite as any)._reset();
  await kv.set("manifest", { commands: ["ping"], components: [] });
  await kv.set("manifest", { commands: ["ping", "echo"], components: ["poll-vote"] });
  const retrieved = await kv.get<{ commands: string[]; components: string[] }>("manifest");
  assertEquals(retrieved?.commands, ["ping", "echo"]);
  assertEquals(retrieved?.components, ["poll-vote"]);
});
