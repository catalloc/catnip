import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import colorPicker from "./color-picker.ts";

Deno.test("color-picker: returns success with prompt message", async () => {
  const result = await colorPicker.execute({
    guildId: "123",
    userId: "456",
    options: {},
    config: {},
  });
  assertEquals(result.success, true);
  assertEquals(result.message, "Choose a color:");
});

Deno.test("color-picker: action row contains string select with correct custom_id", async () => {
  const result = await colorPicker.execute({
    guildId: "123",
    userId: "456",
    options: {},
    config: {},
  });
  assert(result.components);
  assertEquals(result.components!.length, 1);
  const actionRow = result.components![0];
  assertEquals(actionRow.type, 1); // Action Row
  const select = actionRow.components[0];
  assertEquals(select.type, 3); // String Select
  assertEquals(select.custom_id, "color-select");
});

Deno.test("color-picker: select menu has 4 color options", async () => {
  const result = await colorPicker.execute({
    guildId: "123",
    userId: "456",
    options: {},
    config: {},
  });
  const select = result.components![0].components[0];
  assertEquals(select.options.length, 4);
  const values = select.options.map((o: any) => o.value);
  assertEquals(values, ["red", "green", "blue", "yellow"]);
});
