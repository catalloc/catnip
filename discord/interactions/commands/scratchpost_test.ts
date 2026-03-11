import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { kv } from "../../persistence/kv.ts";
import command, { scratchpostKey, buildScratchpostEmbed, buildScratchpostComponents } from "./scratchpost.ts";

function resetStore() {
  (sqlite as any)._reset();
}

const guildId = "g1";
const userId = "u1";

Deno.test("scratchpost: returns embed with zero count for new guild", async () => {
  resetStore();
  const result = await command.execute({ guildId, userId, options: {}, config: {} } as any);
  assertEquals(result.success, true);
  assert(result.embed);
  assert(result.embed.title?.includes("Scratchpost"));
  assert(result.embed.description?.includes("0"));
  assert(result.components);
  assertEquals(result.components!.length, 1);
});

Deno.test("scratchpost: shows existing count", async () => {
  resetStore();
  await kv.set(scratchpostKey(guildId), 42);
  const result = await command.execute({ guildId, userId, options: {}, config: {} } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("42"));
});

Deno.test("scratchpost: command metadata is correct", () => {
  assertEquals(command.name, "scratchpost");
  assertEquals(command.deferred, false);
  assertEquals(command.registration.type, "guild");
});

Deno.test("buildScratchpostEmbed: singular for 1", () => {
  const embed = buildScratchpostEmbed(1);
  assert(embed.description?.includes("**1** time"));
  assert(!embed.description?.includes("times"));
});

Deno.test("buildScratchpostEmbed: plural for 0 and many", () => {
  assert(buildScratchpostEmbed(0).description?.includes("times"));
  assert(buildScratchpostEmbed(5).description?.includes("times"));
});

Deno.test("buildScratchpostComponents: has scratch button", () => {
  const components = buildScratchpostComponents();
  assertEquals(components.length, 1);
  const button = components[0].components[0];
  assertEquals(button.custom_id, "scratchpost-scratch");
  assertEquals(button.type, 2);
  assertEquals(button.label, "Scratch");
});
