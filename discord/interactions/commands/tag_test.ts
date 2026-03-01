import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "@std/assert";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { kv } from "../../persistence/kv.ts";
import { _internals } from "./tag.ts";

function resetStore() {
  (sqlite as any)._reset();
}

const ADMIN_PERMISSIONS = "8"; // ADMINISTRATOR bit

Deno.test("tag _internals.sanitizeTagName: lowercases and strips unsafe chars", () => {
  assertEquals(_internals.sanitizeTagName("Hello`World"), "helloworld");
  assertEquals(_internals.sanitizeTagName("**bold**"), "bold");
  assertEquals(_internals.sanitizeTagName("normal-name"), "normal-name");
});

Deno.test("tag _internals.kvKey: correct prefix", () => {
  assertEquals(_internals.kvKey("guild1"), "tags:guild1");
});

Deno.test("tag add: creates a tag", async () => {
  resetStore();
  const mod = (await import("./tag.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "add", name: "greeting", content: "Hello!" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);
  assert(result.message?.includes("created"));
});

Deno.test("tag view: returns tag content", async () => {
  resetStore();
  await kv.set("tags:g1", { hello: { content: "world", createdBy: "u1", createdAt: "2024-01-01" } });
  const mod = (await import("./tag.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "view", name: "hello" },
    memberRoles: [],
  } as any);
  assertEquals(result.success, true);
  assertEquals(result.message, "world");
});

Deno.test("tag edit: updates existing tag", async () => {
  resetStore();
  await kv.set("tags:g1", { hello: { content: "old", createdBy: "u1", createdAt: "2024-01-01" } });
  const mod = (await import("./tag.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "edit", name: "hello", content: "new content" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);
  assert(result.message?.includes("updated"));

  const tags = await kv.get<Record<string, any>>("tags:g1");
  assertEquals(tags?.hello?.content, "new content");
});

Deno.test("tag remove: deletes a tag", async () => {
  resetStore();
  await kv.set("tags:g1", { hello: { content: "world", createdBy: "u1", createdAt: "2024-01-01" } });
  const mod = (await import("./tag.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "remove", name: "hello" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);
  assert(result.message?.includes("deleted"));
});

Deno.test("tag list: shows all tags", async () => {
  resetStore();
  await kv.set("tags:g1", {
    foo: { content: "bar", createdBy: "u1", createdAt: "2024-01-01" },
    baz: { content: "qux", createdBy: "u1", createdAt: "2024-01-01" },
  });
  const mod = (await import("./tag.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "list" },
    memberRoles: [],
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("foo"));
  assert(result.embed?.description?.includes("baz"));
});

Deno.test("tag add: duplicate tag returns error", async () => {
  resetStore();
  await kv.set("tags:g1", { greeting: { content: "hi", createdBy: "u1", createdAt: "2024-01-01" } });
  const mod = (await import("./tag.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "add", name: "greeting", content: "hello" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("already exists"));
});

Deno.test("tag add: non-admin rejection", async () => {
  resetStore();
  const mod = (await import("./tag.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "add", name: "test", content: "content" },
    memberRoles: [],
    memberPermissions: "0",
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("admin"));
});
