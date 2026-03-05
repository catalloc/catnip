import "../../test/_mocks/env.ts";
import { assertEquals } from "../../test/assert.ts";
import { defineComponent } from "./define-component.ts";

Deno.test("defineComponent: returns the same handler object", () => {
  const handler = defineComponent({
    customId: "test-btn",
    match: "exact",
    type: "button",
    async execute() {
      return { success: true, message: "clicked" };
    },
  });
  assertEquals(handler.customId, "test-btn");
  assertEquals(handler.match, "exact");
  assertEquals(handler.type, "button");
  assertEquals(typeof handler.execute, "function");
});

Deno.test("defineComponent: preserves adminOnly flag", () => {
  const handler = defineComponent({
    customId: "admin-action",
    match: "prefix",
    type: "select",
    adminOnly: true,
    async execute() {
      return { success: true };
    },
  });
  assertEquals(handler.adminOnly, true);

  const noAdmin = defineComponent({
    customId: "public-action",
    match: "exact",
    type: "button",
    async execute() {
      return { success: true };
    },
  });
  assertEquals(noAdmin.adminOnly, undefined);
});
