import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "@std/assert";
import { blob } from "../../../test/_mocks/blob.ts";
import { _internals } from "./stash.ts";

function resetStore() {
  (blob as any)._reset();
}

Deno.test("stash _internals.sanitizeName: lowercases and strips invalid chars", () => {
  assertEquals(_internals.sanitizeName("Hello World!"), "helloworld");
  assertEquals(_internals.sanitizeName("my-snippet"), "my-snippet");
  assertEquals(_internals.sanitizeName("UPPER_CASE"), "uppercase");
  assertEquals(_internals.sanitizeName("a".repeat(50)), "a".repeat(32));
});

Deno.test("stash _internals.blobKey: correct format", () => {
  assertEquals(_internals.blobKey("u1", "test"), "stash:u1:test");
});

Deno.test("stash save: creates a new entry", async () => {
  resetStore();
  const mod = (await import("./stash.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "save", name: "greeting", content: "Hello world!" },
  } as any);
  assertEquals(result.success, true);
  assert(result.message?.includes("saved"));

  const entry = await blob.getJSON<any>("stash:u1:greeting");
  assertEquals(entry?.content, "Hello world!");
});

Deno.test("stash save: upserts existing entry", async () => {
  resetStore();
  await blob.setJSON("stash:u1:greeting", {
    content: "old",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  });
  const mod = (await import("./stash.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "save", name: "greeting", content: "new content" },
  } as any);
  assertEquals(result.success, true);
  assert(result.message?.includes("updated"));

  const entry = await blob.getJSON<any>("stash:u1:greeting");
  assertEquals(entry?.content, "new content");
  assertEquals(entry?.createdAt, "2024-01-01T00:00:00.000Z"); // preserved
});

Deno.test("stash save: rejects invalid name", async () => {
  resetStore();
  const mod = (await import("./stash.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "save", name: "!!!!", content: "test" },
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("Invalid name"));
});

Deno.test("stash save: enforces max entries limit", async () => {
  resetStore();
  for (let i = 0; i < 25; i++) {
    await blob.setJSON(`stash:u1:entry${i}`, {
      content: `content ${i}`,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
  }
  const mod = (await import("./stash.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "save", name: "extra", content: "too many" },
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("Maximum"));
});

Deno.test("stash get: returns entry content", async () => {
  resetStore();
  await blob.setJSON("stash:u1:greeting", {
    content: "Hello world!",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  });
  const mod = (await import("./stash.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "get", name: "greeting" },
  } as any);
  assertEquals(result.success, true);
  assertEquals(result.message, "Hello world!");
});

Deno.test("stash get: not found", async () => {
  resetStore();
  const mod = (await import("./stash.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "get", name: "nope" },
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("not found"));
});

Deno.test("stash list: shows entries with previews", async () => {
  resetStore();
  await blob.setJSON("stash:u1:foo", {
    content: "bar content here",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  });
  await blob.setJSON("stash:u1:baz", {
    content: "qux",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  });
  const mod = (await import("./stash.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "list" },
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("foo"));
  assert(result.embed?.description?.includes("baz"));
});

Deno.test("stash list: empty", async () => {
  resetStore();
  const mod = (await import("./stash.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "list" },
  } as any);
  assertEquals(result.success, true);
  assert(result.message?.includes("No stash entries"));
});

Deno.test("stash delete: removes entry", async () => {
  resetStore();
  await blob.setJSON("stash:u1:greeting", {
    content: "hello",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  });
  const mod = (await import("./stash.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "delete", name: "greeting" },
  } as any);
  assertEquals(result.success, true);
  assert(result.message?.includes("deleted"));

  const entry = await blob.getJSON("stash:u1:greeting");
  assertEquals(entry, undefined);
});

Deno.test("stash delete: not found", async () => {
  resetStore();
  const mod = (await import("./stash.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "delete", name: "nope" },
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("not found"));
});
