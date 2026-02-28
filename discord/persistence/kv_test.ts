import "../../test/_mocks/env.ts";
import { assertEquals } from "@std/assert";
import { sqlite } from "https://esm.town/v/std/sqlite/main.ts";
import { kv, _internals } from "./kv.ts";

const { safeParse } = _internals;

function resetStore() {
  (sqlite as any)._reset();
}

// --- safeParse ---

Deno.test("safeParse: valid JSON object", () => {
  assertEquals(safeParse('{"a":1}'), { a: 1 });
});

Deno.test("safeParse: invalid JSON returns null", () => {
  assertEquals(safeParse("not json"), null);
});

Deno.test("safeParse: valid JSON array", () => {
  assertEquals(safeParse("[1,2,3]"), [1, 2, 3]);
});

// --- kv CRUD ---

Deno.test("kv.get: non-existent key returns null", async () => {
  resetStore();
  assertEquals(await kv.get("missing"), null);
});

Deno.test("kv.set then get: round trip", async () => {
  resetStore();
  await kv.set("key1", { hello: "world" });
  const result = await kv.get("key1");
  assertEquals(result, { hello: "world" });
});

Deno.test("kv.delete: removes key", async () => {
  resetStore();
  await kv.set("delme", 42);
  await kv.delete("delme");
  assertEquals(await kv.get("delme"), null);
});

Deno.test("kv.list: all entries", async () => {
  resetStore();
  await kv.set("a:1", "one");
  await kv.set("a:2", "two");
  await kv.set("b:1", "three");
  const all = await kv.list();
  assertEquals(all.length, 3);
});

Deno.test("kv.list: with prefix filter", async () => {
  resetStore();
  await kv.set("ns:a", 1);
  await kv.set("ns:b", 2);
  await kv.set("other", 3);
  const filtered = await kv.list("ns:");
  assertEquals(filtered.length, 2);
});

Deno.test("kv.update: creates new key", async () => {
  resetStore();
  const result = await kv.update<number>("counter", (cur) => (cur ?? 0) + 1);
  assertEquals(result, 1);
  assertEquals(await kv.get("counter"), 1);
});

Deno.test("kv.update: modifies existing key", async () => {
  resetStore();
  await kv.set("counter", 5);
  const result = await kv.update<number>("counter", (cur) => (cur ?? 0) + 1);
  assertEquals(result, 6);
  assertEquals(await kv.get("counter"), 6);
});

Deno.test("kv.set: overwrites existing value", async () => {
  resetStore();
  await kv.set("key", "first");
  await kv.set("key", "second");
  assertEquals(await kv.get("key"), "second");
});

Deno.test("kv.delete: non-existent key is a no-op", async () => {
  resetStore();
  await kv.delete("ghost");
  assertEquals(await kv.get("ghost"), null);
});

Deno.test("kv.list: empty store returns empty array", async () => {
  resetStore();
  assertEquals(await kv.list(), []);
});
