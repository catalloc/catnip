import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { kv } from "../../persistence/kv.ts";
import { _internals } from "./tag.ts";
import type { TagEntry } from "./tag.ts";

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

// ── canView tests ──

function makeTag(overrides?: Partial<TagEntry>): TagEntry {
  return {
    content: "test content",
    createdBy: "u1",
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

Deno.test("tag _internals.canView: admin always allowed", async () => {
  const tag = makeTag({ allowedRoles: ["role1"] });
  const result = await _internals.canView(tag, "g1", "u1", [], ADMIN_PERMISSIONS);
  assertEquals(result, true);
});

Deno.test("tag _internals.canView: allowed user grants access", async () => {
  const tag = makeTag({ allowedUsers: ["u5"] });
  const result = await _internals.canView(tag, "g1", "u5", [], "0");
  assertEquals(result, true);
});

Deno.test("tag _internals.canView: allowed role grants access", async () => {
  const tag = makeTag({ allowedRoles: ["role1", "role2"] });
  const result = await _internals.canView(tag, "g1", "u2", ["role1"], "0");
  assertEquals(result, true);
});

Deno.test("tag _internals.canView: denied without permission", async () => {
  const tag = makeTag({ allowedRoles: ["role1"] });
  const result = await _internals.canView(tag, "g1", "u2", ["role999"], "0");
  assertEquals(result, false);
});

Deno.test("tag _internals.canView: unrestricted when no lists set", async () => {
  const tag = makeTag();
  const result = await _internals.canView(tag, "g1", "u2", [], "0");
  assertEquals(result, true);
});

Deno.test("tag _internals.canView: denied when only other users allowed", async () => {
  const tag = makeTag({ allowedUsers: ["u5"] });
  const result = await _internals.canView(tag, "g1", "u6", [], "0");
  assertEquals(result, false);
});

// ── view gating tests ──

Deno.test("tag view: gated tag denied for unpermitted user", async () => {
  resetStore();
  await kv.set("tags:g1", { secret: makeTag({ allowedRoles: ["role1"] }) });
  const mod = (await import("./tag.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u2",
    options: { subcommand: "view", name: "secret" },
    memberRoles: [],
    memberPermissions: "0",
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("permission"));
});

Deno.test("tag view: gated tag allowed for permitted user", async () => {
  resetStore();
  await kv.set("tags:g1", { secret: makeTag({ allowedRoles: ["role1"] }) });
  const mod = (await import("./tag.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u2",
    options: { subcommand: "view", name: "secret" },
    memberRoles: ["role1"],
    memberPermissions: "0",
  } as any);
  assertEquals(result.success, true);
  assertEquals(result.message, "test content");
});

// ── allow-role tests ──

Deno.test("tag allow-role: adds role to allowed list", async () => {
  resetStore();
  await kv.set("tags:g1", { hello: makeTag() });
  const mod = (await import("./tag.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "allow-role", name: "hello", role: "role1" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);

  const tags = await kv.get<Record<string, TagEntry>>("tags:g1");
  assert(tags?.hello?.allowedRoles?.includes("role1"));
});

Deno.test("tag allow-role: rejects duplicate", async () => {
  resetStore();
  await kv.set("tags:g1", { hello: makeTag({ allowedRoles: ["role1"] }) });
  const mod = (await import("./tag.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "allow-role", name: "hello", role: "role1" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("already"));
});

Deno.test("tag allow-role: rejects non-admin", async () => {
  resetStore();
  await kv.set("tags:g1", { hello: makeTag() });
  const mod = (await import("./tag.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u2",
    options: { subcommand: "allow-role", name: "hello", role: "role1" },
    memberRoles: [],
    memberPermissions: "0",
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("admin"));
});

Deno.test("tag allow-role: tag not found", async () => {
  resetStore();
  const mod = (await import("./tag.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "allow-role", name: "nope", role: "role1" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("not found"));
});

// ── deny-role tests ──

Deno.test("tag deny-role: removes role from list", async () => {
  resetStore();
  await kv.set("tags:g1", { hello: makeTag({ allowedRoles: ["role1", "role2"] }) });
  const mod = (await import("./tag.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "deny-role", name: "hello", role: "role1" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);

  const tags = await kv.get<Record<string, TagEntry>>("tags:g1");
  assertEquals(tags?.hello?.allowedRoles, ["role2"]);
});

Deno.test("tag deny-role: role not in list", async () => {
  resetStore();
  await kv.set("tags:g1", { hello: makeTag({ allowedRoles: ["role1"] }) });
  const mod = (await import("./tag.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "deny-role", name: "hello", role: "role999" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("doesn't have"));
});

Deno.test("tag deny-role: tag not found", async () => {
  resetStore();
  const mod = (await import("./tag.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "deny-role", name: "nope", role: "role1" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("not found"));
});

// ── allow-user tests ──

Deno.test("tag allow-user: adds user to allowed list", async () => {
  resetStore();
  await kv.set("tags:g1", { hello: makeTag() });
  const mod = (await import("./tag.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "allow-user", name: "hello", user: "u5" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);

  const tags = await kv.get<Record<string, TagEntry>>("tags:g1");
  assert(tags?.hello?.allowedUsers?.includes("u5"));
});

Deno.test("tag allow-user: rejects duplicate", async () => {
  resetStore();
  await kv.set("tags:g1", { hello: makeTag({ allowedUsers: ["u5"] }) });
  const mod = (await import("./tag.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "allow-user", name: "hello", user: "u5" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("already"));
});

Deno.test("tag allow-user: rejects non-admin", async () => {
  resetStore();
  await kv.set("tags:g1", { hello: makeTag() });
  const mod = (await import("./tag.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u2",
    options: { subcommand: "allow-user", name: "hello", user: "u5" },
    memberRoles: [],
    memberPermissions: "0",
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("admin"));
});

Deno.test("tag allow-user: tag not found", async () => {
  resetStore();
  const mod = (await import("./tag.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "allow-user", name: "nope", user: "u5" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("not found"));
});

// ── deny-user tests ──

Deno.test("tag deny-user: removes user from list", async () => {
  resetStore();
  await kv.set("tags:g1", { hello: makeTag({ allowedUsers: ["u5", "u6"] }) });
  const mod = (await import("./tag.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "deny-user", name: "hello", user: "u5" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);

  const tags = await kv.get<Record<string, TagEntry>>("tags:g1");
  assertEquals(tags?.hello?.allowedUsers, ["u6"]);
});

Deno.test("tag deny-user: user not in list", async () => {
  resetStore();
  await kv.set("tags:g1", { hello: makeTag({ allowedUsers: ["u5"] }) });
  const mod = (await import("./tag.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "deny-user", name: "hello", user: "u999" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("doesn't have"));
});

Deno.test("tag deny-user: tag not found", async () => {
  resetStore();
  const mod = (await import("./tag.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "deny-user", name: "nope", user: "u5" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("not found"));
});

// ── list with permission info ──

Deno.test("tag list: shows permission info", async () => {
  resetStore();
  await kv.set("tags:g1", {
    open: makeTag(),
    restricted: makeTag({ allowedRoles: ["role1"], allowedUsers: ["u5"] }),
  });
  const mod = (await import("./tag.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "list" },
    memberRoles: [],
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("open"));
  assert(result.embed?.description?.includes("restricted"));
  assert(result.embed?.description?.includes("<@&role1>"));
  assert(result.embed?.description?.includes("<@u5>"));
});
