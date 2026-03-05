import "../../test/_mocks/env.ts";
import "../../test/_mocks/sqlite.ts";
import { assertEquals, assert } from "../../test/assert.ts";
import { getCommand, getAllCommands, getComponentHandler } from "./registry.ts";

// --- getCommand ---

Deno.test("registry getCommand: returns undefined for unknown name", () => {
  const cmd = getCommand("__nonexistent_command_xyz__");
  assertEquals(cmd, undefined);
});

Deno.test("registry getCommand: returns command for known name", () => {
  const cmd = getCommand("ping");
  assert(cmd !== undefined, "ping should be registered");
  assertEquals(cmd!.name, "ping");
  assertEquals(typeof cmd!.execute, "function");
});

// --- getAllCommands ---

Deno.test("registry getAllCommands: returns populated array", () => {
  const all = getAllCommands();
  assert(Array.isArray(all));
  assert(all.length > 0, "Should have at least one command registered");
  for (const cmd of all) {
    assertEquals(typeof cmd.name, "string");
    assertEquals(typeof cmd.execute, "function");
  }
});

// --- getComponentHandler ---

Deno.test("registry getComponentHandler: exact match works", () => {
  // "example-button" is registered as an exact-match button handler
  const handler = getComponentHandler("example-button", "button");
  assert(handler !== undefined, "example-button should be registered");
  assertEquals(handler!.customId, "example-button");
});

Deno.test("registry getComponentHandler: prefix match works", () => {
  // "facts-page:" is a prefix-match button handler
  const handler = getComponentHandler("facts-page:3", "button");
  assert(handler !== undefined, "facts-page prefix should match");
  assertEquals(handler!.customId, "facts-page:");
});

Deno.test("registry getComponentHandler: type mismatch returns undefined", () => {
  // "example-button" is a button, not a modal
  const handler = getComponentHandler("example-button", "modal");
  assertEquals(handler, undefined);
});

Deno.test("registry getComponentHandler: unknown customId returns undefined", () => {
  const handler = getComponentHandler("__no_such_handler__", "button");
  assertEquals(handler, undefined);
});
