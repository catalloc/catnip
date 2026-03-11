import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { kv } from "../../persistence/kv.ts";
import scratchpostScratch from "./scratchpost-scratch.ts";
import { scratchpostKey } from "../commands/scratchpost.ts";

function resetStore() {
  (sqlite as any)._reset();
}

function makeCtx(guildId = "g1", userId = "u1") {
  return {
    customId: "scratchpost-scratch",
    guildId,
    userId,
    interaction: {},
  };
}

Deno.test("scratchpost-scratch: increments from zero", async () => {
  resetStore();
  const result = await scratchpostScratch.execute(makeCtx());
  assertEquals(result.success, true);
  assert(result.message!.includes("u1"));
  assert(result.embed?.description?.includes("1"));
  assertEquals(result.updateMessage, true);
  assert(result.components);

  const count = await kv.get<number>(scratchpostKey("g1"));
  assertEquals(count, 1);
});

Deno.test("scratchpost-scratch: increments existing count", async () => {
  resetStore();
  await kv.set(scratchpostKey("g1"), 10);
  const result = await scratchpostScratch.execute(makeCtx());
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("11"));

  const count = await kv.get<number>(scratchpostKey("g1"));
  assertEquals(count, 11);
});

Deno.test("scratchpost-scratch: multiple scratches accumulate", async () => {
  resetStore();
  await scratchpostScratch.execute(makeCtx("g1", "u1"));
  await scratchpostScratch.execute(makeCtx("g1", "u2"));
  await scratchpostScratch.execute(makeCtx("g1", "u3"));

  const count = await kv.get<number>(scratchpostKey("g1"));
  assertEquals(count, 3);
});

Deno.test("scratchpost-scratch: different guilds have separate counts", async () => {
  resetStore();
  await scratchpostScratch.execute(makeCtx("g1", "u1"));
  await scratchpostScratch.execute(makeCtx("g1", "u1"));
  await scratchpostScratch.execute(makeCtx("g2", "u1"));

  assertEquals(await kv.get<number>(scratchpostKey("g1")), 2);
  assertEquals(await kv.get<number>(scratchpostKey("g2")), 1);
});

Deno.test("scratchpost-scratch: component metadata is correct", () => {
  assertEquals(scratchpostScratch.customId, "scratchpost-scratch");
  assertEquals(scratchpostScratch.match, "exact");
  assertEquals(scratchpostScratch.type, "button");
});
