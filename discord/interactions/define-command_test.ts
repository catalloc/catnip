import "../../test/_mocks/env.ts";
import { assertEquals } from "@std/assert";
import { defineCommand } from "./define-command.ts";

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
    registration: { type: "guild" },
    config: { limit: 10 },
    async execute() {
      return { success: true };
    },
  });
  assertEquals(cmd.config, { limit: 10 });
});

Deno.test("defineCommand: preserves adminOnly flag", () => {
  const cmd = defineCommand({
    name: "admin-test",
    description: "An admin command",
    registration: { type: "global" },
    adminOnly: true,
    async execute() {
      return { success: true };
    },
  });
  assertEquals(cmd.adminOnly, true);
});
