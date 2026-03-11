import "../../../test/_mocks/env.ts";
import { assertEquals } from "../../../test/assert.ts";
import handler from "./color-select.ts";

Deno.test("color-select: known colors return correct hex", async () => {
  const red = await handler.execute({ values: ["red"] } as any);
  assertEquals(red.embed!.title, "You picked Red!");
  assertEquals(red.embed!.color, 0xed4245);

  const blue = await handler.execute({ values: ["blue"] } as any);
  assertEquals(blue.embed!.title, "You picked Blue!");
  assertEquals(blue.embed!.color, 0x5865f2);

  const green = await handler.execute({ values: ["green"] } as any);
  assertEquals(green.embed!.title, "You picked Green!");

  const yellow = await handler.execute({ values: ["yellow"] } as any);
  assertEquals(yellow.embed!.title, "You picked Yellow!");
});

Deno.test("color-select: unknown value falls back to red", async () => {
  const result = await handler.execute({ values: ["purple"] } as any);
  assertEquals(result.embed!.title, "You picked Red!");
  assertEquals(result.embed!.color, 0xed4245);
});

Deno.test("color-select: empty/missing values default to red", async () => {
  const empty = await handler.execute({ values: [] } as any);
  assertEquals(empty.embed!.color, 0xed4245);

  const missing = await handler.execute({} as any);
  assertEquals(missing.embed!.color, 0xed4245);
});

Deno.test("color-select: returns updateMessage true", async () => {
  const result = await handler.execute({ values: ["green"] } as any);
  assertEquals(result.updateMessage, true);
  assertEquals(result.success, true);
});

Deno.test("color-select: metadata", () => {
  assertEquals(handler.customId, "color-select");
  assertEquals(handler.match, "exact");
  assertEquals(handler.type, "select");
});
