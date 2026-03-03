import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "@std/assert";
import { blob } from "../../../test/_mocks/blob.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { _internals } from "./paste.ts";
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
    options: { subcommand: "get", code: "nope1234" },
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
    options: { subcommand: "delete", code: "nope1234" },
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
