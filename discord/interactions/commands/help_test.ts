import "../../../test/_mocks/env.ts";
import "../../../test/_mocks/sqlite.ts";
import { assertEquals, assert, assertStringIncludes } from "../../../test/assert.ts";
import { EmbedColors } from "../../../discord/constants.ts";
import help from "./help.ts";

Deno.test("help: returns embed with Available Commands title", async () => {
  const result = await help.execute({
    guildId: "123",
    userId: "456",
    options: {},
    config: {},
  });
  assertEquals(result.success, true);
  assert(result.embed);
  assertEquals(result.embed!.title, "Available Commands");
});

Deno.test("help: filters out adminOnly commands", async () => {
  const result = await help.execute({
    guildId: "123",
    userId: "456",
    options: {},
    config: {},
  });
  const desc = result.embed!.description!;
  // "server" is adminOnly, should not appear
  assert(!desc.includes("/server"), "adminOnly commands should be filtered out");
});

Deno.test("help: commands are sorted alphabetically", async () => {
  const result = await help.execute({
    guildId: "123",
    userId: "456",
    options: {},
    config: {},
  });
  const desc = result.embed!.description!;
  const names = desc.split("\n").map((line: string) => {
    const match = line.match(/\*\*\/(.+?)\*\*/);
    return match ? match[1] : "";
  }).filter(Boolean);
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  assertEquals(names, sorted);
});

Deno.test("help: embed uses INFO color", async () => {
  const result = await help.execute({
    guildId: "123",
    userId: "456",
    options: {},
    config: {},
  });
  assertEquals(result.embed!.color, EmbedColors.INFO);
});
