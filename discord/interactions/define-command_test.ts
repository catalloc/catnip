import "../../test/_mocks/env.ts";
import { assertEquals } from "@std/assert";
import { defineCommand, parseServerKey } from "./define-command.ts";

Deno.test("parseServerKey: valid key (uppercase)", () => {
  assertEquals(parseServerKey("MAIN"), "MAIN");
});

Deno.test("parseServerKey: valid key (lowercase)", () => {
  assertEquals(parseServerKey("main"), "MAIN");
});

Deno.test("parseServerKey: invalid key returns null", () => {
  assertEquals(parseServerKey("INVALID"), null);
});

Deno.test("defineCommand: provides default empty config", () => {
  const cmd = defineCommand({
    name: "test",
    description: "A test command",
    registration: { type: "global" },
    async execute() {
      return { success: true };
    },
  });
  assertEquals(cmd.name, "test");
  assertEquals(cmd.config, {});
});

Deno.test("defineCommand: preserves custom config", () => {
  const cmd = defineCommand({
    name: "test",
    description: "A test",
    registration: { type: "guild", servers: ["MAIN"] },
    config: { limit: 10 },
    async execute() {
      return { success: true };
    },
  });
  assertEquals(cmd.config, { limit: 10 });
});
