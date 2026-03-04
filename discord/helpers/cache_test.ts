import { assertEquals, assert } from "../../test/assert.ts";
import { ExpiringCache } from "./cache.ts";

Deno.test("cache get/set: stores and retrieves values", () => {
  const cache = new ExpiringCache<string, number>(60_000, 100);
  cache.set("a", 1);
  assertEquals(cache.get("a"), 1);
});

Deno.test("cache get: returns undefined for missing keys", () => {
  const cache = new ExpiringCache<string, number>(60_000, 100);
  assertEquals(cache.get("missing"), undefined);
});

Deno.test("cache TTL: expired entries return undefined", () => {
  const cache = new ExpiringCache<string, number>(0, 100);
  cache.set("a", 1);
  // TTL of 0ms means it expires immediately
  assertEquals(cache.get("a"), undefined);
});

Deno.test("cache max entries: evicts oldest when full", () => {
  const cache = new ExpiringCache<string, number>(60_000, 2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3); // should evict "a"
  assertEquals(cache.get("a"), undefined);
  assertEquals(cache.get("b"), 2);
  assertEquals(cache.get("c"), 3);
});

Deno.test("cache max entries: updating existing key does not evict", () => {
  const cache = new ExpiringCache<string, number>(60_000, 2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("a", 10); // update, not new entry
  assertEquals(cache.get("a"), 10);
  assertEquals(cache.get("b"), 2);
});

Deno.test("cache delete: removes entry", () => {
  const cache = new ExpiringCache<string, number>(60_000, 100);
  cache.set("a", 1);
  cache.delete("a");
  assertEquals(cache.get("a"), undefined);
});

Deno.test("cache delete: no-op for missing key", () => {
  const cache = new ExpiringCache<string, number>(60_000, 100);
  cache.delete("missing"); // should not throw
});

Deno.test("cache getOrFetch: returns cached value without calling fetcher", async () => {
  const cache = new ExpiringCache<string, number>(60_000, 100);
  cache.set("a", 42);
  let called = false;
  const value = await cache.getOrFetch("a", async () => {
    called = true;
    return 99;
  });
  assertEquals(value, 42);
  assertEquals(called, false);
});

Deno.test("cache getOrFetch: calls fetcher and caches on miss", async () => {
  const cache = new ExpiringCache<string, number>(60_000, 100);
  let callCount = 0;
  const value = await cache.getOrFetch("a", async () => {
    callCount++;
    return 42;
  });
  assertEquals(value, 42);
  assertEquals(callCount, 1);
  // Second call should use cache
  const value2 = await cache.getOrFetch("a", async () => {
    callCount++;
    return 99;
  });
  assertEquals(value2, 42);
  assertEquals(callCount, 1);
});
