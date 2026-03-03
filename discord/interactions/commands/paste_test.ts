import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "@std/assert";
import { blob } from "../../../test/_mocks/blob.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { _internals } from "./paste.ts";
import type { PasteEntry } from "./paste.ts";
import { InteractionResponseType } from "../patterns.ts";

function resetStore() {
  (blob as any)._reset();
  (sqlite as any)._reset();
}

const ADMIN_PERMISSIONS = "8";

function autocompleteBody(guildId: string, query: string) {
  return {
    guild_id: guildId,
    data: {
      options: [{
        options: [{ name: "code", value: query, focused: true }],
      }],
    },
  };
}

Deno.test("paste _internals.blobKey: correct format", () => {
  assertEquals(_internals.blobKey("g1", "abc123"), "paste:g1:abc123");
});

Deno.test("paste _internals.blobPrefix: correct format", () => {
  assertEquals(_internals.blobPrefix("g1"), "paste:g1:");
});

Deno.test("paste _internals.generateCode: returns 8-char hex", () => {
  const code = _internals.generateCode();
  assertEquals(code.length, 8);
  assert(/^[0-9a-f]{8}$/.test(code));
});

Deno.test("paste _internals.sanitizeCode: accepts valid hex codes", () => {
  assertEquals(_internals.sanitizeCode("abc12345"), "abc12345");
  assertEquals(_internals.sanitizeCode("ABCDEF"), "abcdef");
  assertEquals(_internals.sanitizeCode("0"), "0");
});

Deno.test("paste _internals.sanitizeCode: rejects non-hex", () => {
  assertEquals(_internals.sanitizeCode("hello!"), null);
  assertEquals(_internals.sanitizeCode("../../../etc"), null);
  assertEquals(_internals.sanitizeCode("abc 123"), null);
  assertEquals(_internals.sanitizeCode(""), null);
});

Deno.test("paste _internals.sanitizeCode: rejects too-long codes", () => {
  assertEquals(_internals.sanitizeCode("a".repeat(17)), null);
  assertEquals(_internals.sanitizeCode("a".repeat(16)), "a".repeat(16));
});

Deno.test("paste create: stores content and returns code", async () => {
  resetStore();
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "create", content: "Hello paste!" },
    memberRoles: [],
  } as any);
  assertEquals(result.success, true);
  assert(result.message?.includes("Paste created"));

  // Verify stored
  const items = await blob.list("paste:g1:");
  assertEquals(items.length, 1);
});

Deno.test("paste create: enforces max pastes", async () => {
  resetStore();
  for (let i = 0; i < 50; i++) {
    await blob.setJSON(`paste:g1:code${i.toString().padStart(4, "0")}`, {
      content: `content ${i}`,
      createdBy: "u1",
      createdAt: "2024-01-01T00:00:00.000Z",
    });
  }
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "create", content: "too many" },
    memberRoles: [],
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("Maximum"));
});

Deno.test("paste get: returns content (ephemeral by default)", async () => {
  resetStore();
  await blob.setJSON("paste:g1:abc12345", {
    content: "Hello paste content!",
    createdBy: "u1",
    createdAt: "2024-01-01T00:00:00.000Z",
  });
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u2",
    options: { subcommand: "get", code: "abc12345" },
    memberRoles: [],
  } as any);
  assertEquals(result.success, true);
  assertEquals(result.message, "Hello paste content!");
  assertEquals(result.ephemeral, true);
});

Deno.test("paste get: public mode", async () => {
  resetStore();
  await blob.setJSON("paste:g1:abc12345", {
    content: "Public paste!",
    createdBy: "u1",
    createdAt: "2024-01-01T00:00:00.000Z",
  });
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u2",
    options: { subcommand: "get", code: "abc12345", public: true },
    memberRoles: [],
  } as any);
  assertEquals(result.success, true);
  assertEquals(result.ephemeral, false);
});

Deno.test("paste get: not found", async () => {
  resetStore();
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "get", code: "dead0000" },
    memberRoles: [],
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("not found"));
});

Deno.test("paste list: shows pastes with previews", async () => {
  resetStore();
  await blob.setJSON("paste:g1:code0001", {
    content: "first paste content",
    createdBy: "u1",
    createdAt: "2024-01-01T00:00:00.000Z",
  });
  await blob.setJSON("paste:g1:code0002", {
    content: "second paste",
    createdBy: "u2",
    createdAt: "2024-01-02T00:00:00.000Z",
  });
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "list" },
    memberRoles: [],
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("code0001"));
  assert(result.embed?.description?.includes("code0002"));
});

Deno.test("paste list: empty", async () => {
  resetStore();
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "list" },
    memberRoles: [],
  } as any);
  assertEquals(result.success, true);
  assert(result.message?.includes("No pastes found"));
});

Deno.test("paste delete: creator can delete own paste", async () => {
  resetStore();
  await blob.setJSON("paste:g1:abc12345", {
    content: "my paste",
    createdBy: "u1",
    createdAt: "2024-01-01T00:00:00.000Z",
  });
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "delete", code: "abc12345" },
    memberRoles: [],
    memberPermissions: "0",
  } as any);
  assertEquals(result.success, true);
  assert(result.message?.includes("deleted"));

  const entry = await blob.getJSON("paste:g1:abc12345");
  assertEquals(entry, undefined);
});

Deno.test("paste delete: admin can delete anyone's paste", async () => {
  resetStore();
  await blob.setJSON("paste:g1:abc12345", {
    content: "someone else's paste",
    createdBy: "u1",
    createdAt: "2024-01-01T00:00:00.000Z",
  });
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u2",
    options: { subcommand: "delete", code: "abc12345" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);
  assert(result.message?.includes("deleted"));
});

Deno.test("paste delete: non-creator non-admin rejected", async () => {
  resetStore();
  await blob.setJSON("paste:g1:abc12345", {
    content: "not yours",
    createdBy: "u1",
    createdAt: "2024-01-01T00:00:00.000Z",
  });
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u2",
    options: { subcommand: "delete", code: "abc12345" },
    memberRoles: [],
    memberPermissions: "0",
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("admin"));
});

Deno.test("paste delete: not found", async () => {
  resetStore();
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "delete", code: "dead0000" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("not found"));
});

Deno.test("paste: invalid subcommand returns error", async () => {
  resetStore();
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "invalid" },
    memberRoles: [],
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("subcommand"));
});

Deno.test("paste list: truncates long content with ellipsis", async () => {
  resetStore();
  await blob.setJSON("paste:g1:code0001", {
    content: "x".repeat(100),
    createdBy: "u1",
    createdAt: "2024-01-01T00:00:00.000Z",
  });
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "list" },
    memberRoles: [],
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("..."));
  assert(!result.embed?.description?.includes("x".repeat(51)));
});

Deno.test("paste autocomplete: returns all pastes with empty query", async () => {
  resetStore();
  await blob.setJSON("paste:ac-g1:aaa11111", {
    content: "first paste",
    createdBy: "u1",
    createdAt: "2024-01-01T00:00:00.000Z",
  });
  await blob.setJSON("paste:ac-g1:bbb22222", {
    content: "second paste",
    createdBy: "u1",
    createdAt: "2024-01-01T00:00:00.000Z",
  });
  const mod = (await import("./paste.ts")).default;
  const resp = await mod.autocomplete!(autocompleteBody("ac-g1", ""), {});
  const data = await resp.json();
  assertEquals(data.type, InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT);
  assertEquals(data.data.choices.length, 2);
});

Deno.test("paste autocomplete: filters by code", async () => {
  resetStore();
  await blob.setJSON("paste:ac-g2:aaa11111", {
    content: "first",
    createdBy: "u1",
    createdAt: "2024-01-01T00:00:00.000Z",
  });
  await blob.setJSON("paste:ac-g2:bbb22222", {
    content: "second",
    createdBy: "u1",
    createdAt: "2024-01-01T00:00:00.000Z",
  });
  const mod = (await import("./paste.ts")).default;
  const resp = await mod.autocomplete!(autocompleteBody("ac-g2", "aaa"), {});
  const data = await resp.json();
  assertEquals(data.data.choices.length, 1);
  assertEquals(data.data.choices[0].value, "aaa11111");
});

Deno.test("paste autocomplete: filters by content", async () => {
  resetStore();
  await blob.setJSON("paste:ac-g3:aaa11111", {
    content: "hello world",
    createdBy: "u1",
    createdAt: "2024-01-01T00:00:00.000Z",
  });
  await blob.setJSON("paste:ac-g3:bbb22222", {
    content: "goodbye moon",
    createdBy: "u1",
    createdAt: "2024-01-01T00:00:00.000Z",
  });
  const mod = (await import("./paste.ts")).default;
  const resp = await mod.autocomplete!(autocompleteBody("ac-g3", "hello"), {});
  const data = await resp.json();
  assertEquals(data.data.choices.length, 1);
  assertEquals(data.data.choices[0].value, "aaa11111");
});

Deno.test("paste autocomplete: scoped to guild", async () => {
  resetStore();
  await blob.setJSON("paste:ac-g4:aaa11111", {
    content: "guild 1",
    createdBy: "u1",
    createdAt: "2024-01-01T00:00:00.000Z",
  });
  await blob.setJSON("paste:ac-g5:bbb22222", {
    content: "guild 2",
    createdBy: "u1",
    createdAt: "2024-01-01T00:00:00.000Z",
  });
  const mod = (await import("./paste.ts")).default;
  const resp = await mod.autocomplete!(autocompleteBody("ac-g4", ""), {});
  const data = await resp.json();
  assertEquals(data.data.choices.length, 1);
  assertEquals(data.data.choices[0].value, "aaa11111");
});

Deno.test("paste get: rejects invalid code (non-hex)", async () => {
  resetStore();
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "get", code: "../../../etc/passwd" },
    memberRoles: [],
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("Invalid paste code"));
});

Deno.test("paste get: rejects code that is too long", async () => {
  resetStore();
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "get", code: "a".repeat(17) },
    memberRoles: [],
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("Invalid paste code"));
});

Deno.test("paste delete: rejects invalid code (non-hex)", async () => {
  resetStore();
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "delete", code: "hello world!" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("Invalid paste code"));
});

Deno.test("paste create: enforces per-user paste limit", async () => {
  resetStore();
  for (let i = 0; i < 15; i++) {
    await blob.setJSON(`paste:g1:${i.toString(16).padStart(8, "0")}`, {
      content: `paste ${i}`,
      createdBy: "u1",
      createdAt: "2024-01-01T00:00:00.000Z",
    });
  }
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "create", content: "one more" },
    memberRoles: [],
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("maximum of 15"));
});

Deno.test("paste create: per-user limit does not block other users", async () => {
  resetStore();
  for (let i = 0; i < 15; i++) {
    await blob.setJSON(`paste:g1:${i.toString(16).padStart(8, "0")}`, {
      content: `paste ${i}`,
      createdBy: "u1",
      createdAt: "2024-01-01T00:00:00.000Z",
    });
  }
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u2",
    options: { subcommand: "create", content: "I'm a different user" },
    memberRoles: [],
  } as any);
  assertEquals(result.success, true);
  assert(result.message?.includes("Paste created"));
});

// ── canGet tests ──

function makePaste(overrides?: Partial<PasteEntry>): PasteEntry {
  return {
    content: "test paste content",
    createdBy: "u1",
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

Deno.test("paste _internals.canGet: admin always allowed", async () => {
  const entry = makePaste({ allowedRoles: ["role1"] });
  const result = await _internals.canGet(entry, "g1", "u1", [], ADMIN_PERMISSIONS);
  assertEquals(result, true);
});

Deno.test("paste _internals.canGet: allowed user grants access", async () => {
  const entry = makePaste({ allowedUsers: ["u5"] });
  const result = await _internals.canGet(entry, "g1", "u5", [], "0");
  assertEquals(result, true);
});

Deno.test("paste _internals.canGet: allowed role grants access", async () => {
  const entry = makePaste({ allowedRoles: ["role1", "role2"] });
  const result = await _internals.canGet(entry, "g1", "u2", ["role1"], "0");
  assertEquals(result, true);
});

Deno.test("paste _internals.canGet: denied without permission", async () => {
  const entry = makePaste({ allowedRoles: ["role1"] });
  const result = await _internals.canGet(entry, "g1", "u2", ["role999"], "0");
  assertEquals(result, false);
});

Deno.test("paste _internals.canGet: unrestricted when no lists set", async () => {
  const entry = makePaste();
  const result = await _internals.canGet(entry, "g1", "u2", [], "0");
  assertEquals(result, true);
});

Deno.test("paste _internals.canGet: denied when only other users allowed", async () => {
  const entry = makePaste({ allowedUsers: ["u5"] });
  const result = await _internals.canGet(entry, "g1", "u6", [], "0");
  assertEquals(result, false);
});

// ── get gating tests ──

Deno.test("paste get: gated paste denied for unpermitted user", async () => {
  resetStore();
  await blob.setJSON("paste:g1:abc12345", makePaste({ allowedRoles: ["role1"] }));
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u2",
    options: { subcommand: "get", code: "abc12345" },
    memberRoles: [],
    memberPermissions: "0",
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("permission"));
});

Deno.test("paste get: gated paste allowed for permitted user", async () => {
  resetStore();
  await blob.setJSON("paste:g1:abc12345", makePaste({ allowedRoles: ["role1"] }));
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u2",
    options: { subcommand: "get", code: "abc12345" },
    memberRoles: ["role1"],
    memberPermissions: "0",
  } as any);
  assertEquals(result.success, true);
  assertEquals(result.message, "test paste content");
});

// ── allow-role tests ──

Deno.test("paste allow-role: adds role to allowed list", async () => {
  resetStore();
  await blob.setJSON("paste:g1:abc12345", makePaste());
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "allow-role", code: "abc12345", role: "role1" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);

  const entry = await blob.getJSON<PasteEntry>("paste:g1:abc12345");
  assert(entry?.allowedRoles?.includes("role1"));
});

Deno.test("paste allow-role: rejects duplicate", async () => {
  resetStore();
  await blob.setJSON("paste:g1:abc12345", makePaste({ allowedRoles: ["role1"] }));
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "allow-role", code: "abc12345", role: "role1" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("already"));
});

Deno.test("paste allow-role: rejects non-admin", async () => {
  resetStore();
  await blob.setJSON("paste:g1:abc12345", makePaste());
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u2",
    options: { subcommand: "allow-role", code: "abc12345", role: "role1" },
    memberRoles: [],
    memberPermissions: "0",
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("admin"));
});

Deno.test("paste allow-role: paste not found", async () => {
  resetStore();
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "allow-role", code: "dead0000", role: "role1" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("not found"));
});

// ── deny-role tests ──

Deno.test("paste deny-role: removes role from list", async () => {
  resetStore();
  await blob.setJSON("paste:g1:abc12345", makePaste({ allowedRoles: ["role1", "role2"] }));
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "deny-role", code: "abc12345", role: "role1" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);

  const entry = await blob.getJSON<PasteEntry>("paste:g1:abc12345");
  assertEquals(entry?.allowedRoles, ["role2"]);
});

Deno.test("paste deny-role: role not in list", async () => {
  resetStore();
  await blob.setJSON("paste:g1:abc12345", makePaste({ allowedRoles: ["role1"] }));
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "deny-role", code: "abc12345", role: "role999" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("doesn't have"));
});

Deno.test("paste deny-role: paste not found", async () => {
  resetStore();
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "deny-role", code: "dead0000", role: "role1" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("not found"));
});

// ── allow-user tests ──

Deno.test("paste allow-user: adds user to allowed list", async () => {
  resetStore();
  await blob.setJSON("paste:g1:abc12345", makePaste());
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "allow-user", code: "abc12345", user: "u5" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);

  const entry = await blob.getJSON<PasteEntry>("paste:g1:abc12345");
  assert(entry?.allowedUsers?.includes("u5"));
});

Deno.test("paste allow-user: rejects duplicate", async () => {
  resetStore();
  await blob.setJSON("paste:g1:abc12345", makePaste({ allowedUsers: ["u5"] }));
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "allow-user", code: "abc12345", user: "u5" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("already"));
});

Deno.test("paste allow-user: rejects non-admin", async () => {
  resetStore();
  await blob.setJSON("paste:g1:abc12345", makePaste());
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u2",
    options: { subcommand: "allow-user", code: "abc12345", user: "u5" },
    memberRoles: [],
    memberPermissions: "0",
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("admin"));
});

Deno.test("paste allow-user: paste not found", async () => {
  resetStore();
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "allow-user", code: "dead0000", user: "u5" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("not found"));
});

// ── deny-user tests ──

Deno.test("paste deny-user: removes user from list", async () => {
  resetStore();
  await blob.setJSON("paste:g1:abc12345", makePaste({ allowedUsers: ["u5", "u6"] }));
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "deny-user", code: "abc12345", user: "u5" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);

  const entry = await blob.getJSON<PasteEntry>("paste:g1:abc12345");
  assertEquals(entry?.allowedUsers, ["u6"]);
});

Deno.test("paste deny-user: user not in list", async () => {
  resetStore();
  await blob.setJSON("paste:g1:abc12345", makePaste({ allowedUsers: ["u5"] }));
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "deny-user", code: "abc12345", user: "u999" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("doesn't have"));
});

Deno.test("paste deny-user: paste not found", async () => {
  resetStore();
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "deny-user", code: "dead0000", user: "u5" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("not found"));
});

// ── list with permission info ──

Deno.test("paste list: shows permission info", async () => {
  resetStore();
  await blob.setJSON("paste:g1:code0001", makePaste());
  await blob.setJSON("paste:g1:code0002", makePaste({ allowedRoles: ["role1"], allowedUsers: ["u5"] }));
  const mod = (await import("./paste.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "list" },
    memberRoles: [],
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("code0001"));
  assert(result.embed?.description?.includes("code0002"));
  assert(result.embed?.description?.includes("<@&role1>"));
  assert(result.embed?.description?.includes("<@u5>"));
});
