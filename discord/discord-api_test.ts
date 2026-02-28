import "../test/_mocks/env.ts";
import { assertEquals } from "@std/assert";
import { commandsPath } from "./discord-api.ts";

Deno.test("commandsPath: global commands", () => {
  assertEquals(commandsPath("123"), "applications/123/commands");
});

Deno.test("commandsPath: guild commands", () => {
  assertEquals(commandsPath("123", "456"), "applications/123/guilds/456/commands");
});

Deno.test("commandsPath: specific guild command", () => {
  assertEquals(commandsPath("123", "456", "789"), "applications/123/guilds/456/commands/789");
});

Deno.test("commandsPath: specific global command", () => {
  assertEquals(commandsPath("123", undefined, "789"), "applications/123/commands/789");
});
