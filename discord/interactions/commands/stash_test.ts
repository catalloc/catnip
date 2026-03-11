import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { blob } from "../../../test/_mocks/blob.ts";
import { _internals } from "./stash.ts";
import { InteractionResponseType } from "../patterns.ts";

function resetStore() {
  (blob as any)._reset();
}

function autocompleteBody(userId: string, query: string) {
  return {
    member: { user: { id: userId } },
    data: {
      options: [{
        options: [{ name: "name", value: query, focused: true }],
      }],
    },
  };
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

Deno.test("stash _internals.blobPrefix: correct format", () => {
  assertEquals(_internals.blobPrefix("u1"), "stash:u1:");
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

Deno.test("stash: invalid subcommand returns error", async () => {
  resetStore();
  const mod = (await import("./stash.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "invalid" },
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("subcommand"));
});

Deno.test("stash save: sets updatedAt on new entry", async () => {
  resetStore();
  const before = new Date().toISOString();
  const mod = (await import("./stash.ts")).default;
  await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "save", name: "test", content: "data" },
  } as any);
  const entry = await blob.getJSON<any>("stash:u1:test");
  assert(entry?.createdAt >= before);
  assert(entry?.updatedAt >= before);
  assertEquals(entry?.createdAt, entry?.updatedAt);
});

Deno.test("stash save: updates updatedAt on upsert", async () => {
  resetStore();
  await blob.setJSON("stash:u1:test", {
    content: "old",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  });
  const mod = (await import("./stash.ts")).default;
  await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "save", name: "test", content: "new" },
  } as any);
  const entry = await blob.getJSON<any>("stash:u1:test");
  assertEquals(entry?.createdAt, "2024-01-01T00:00:00.000Z");
  assert(entry?.updatedAt > "2024-01-01T00:00:00.000Z");
});

Deno.test("stash list: truncates long content with ellipsis", async () => {
  resetStore();
  const longContent = "x".repeat(100);
  await blob.setJSON("stash:u1:long", {
    content: longContent,
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
  assert(result.embed?.description?.includes("..."));
  // Preview should be 50 chars + "..."
  assert(!result.embed?.description?.includes("x".repeat(51)));
});

Deno.test("stash autocomplete: returns all keys with empty query", async () => {
  resetStore();
  await blob.setJSON("stash:ac-u1:alpha", { content: "a", createdAt: "", updatedAt: "" });
  await blob.setJSON("stash:ac-u1:beta", { content: "b", createdAt: "", updatedAt: "" });
  const mod = (await import("./stash.ts")).default;
  const resp = await mod.autocomplete!(autocompleteBody("ac-u1", ""), {});
  const data = await resp.json();
  assertEquals(data.type, InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT);
  assertEquals(data.data.choices.length, 2);
});

Deno.test("stash autocomplete: filters by query", async () => {
  resetStore();
  await blob.setJSON("stash:ac-u2:alpha", { content: "a", createdAt: "", updatedAt: "" });
  await blob.setJSON("stash:ac-u2:beta", { content: "b", createdAt: "", updatedAt: "" });
  const mod = (await import("./stash.ts")).default;
  const resp = await mod.autocomplete!(autocompleteBody("ac-u2", "alp"), {});
  const data = await resp.json();
  assertEquals(data.data.choices.length, 1);
  assertEquals(data.data.choices[0].value, "alpha");
});

Deno.test("stash autocomplete: returns empty for no matches", async () => {
  resetStore();
  await blob.setJSON("stash:ac-u3:alpha", { content: "a", createdAt: "", updatedAt: "" });
  const mod = (await import("./stash.ts")).default;
  const resp = await mod.autocomplete!(autocompleteBody("ac-u3", "zzz"), {});
  const data = await resp.json();
  assertEquals(data.data.choices.length, 0);
});

Deno.test("stash autocomplete: scoped to user", async () => {
  resetStore();
  await blob.setJSON("stash:ac-u4:mine", { content: "a", createdAt: "", updatedAt: "" });
  await blob.setJSON("stash:ac-u5:theirs", { content: "b", createdAt: "", updatedAt: "" });
  const mod = (await import("./stash.ts")).default;
  const resp = await mod.autocomplete!(autocompleteBody("ac-u4", ""), {});
  const data = await resp.json();
  assertEquals(data.data.choices.length, 1);
  assertEquals(data.data.choices[0].value, "mine");
});

// ── Batch 4h tests ──

Deno.test("stash: sanitizeName empty returns empty string", () => {
  const result = _internals.sanitizeName("");
  assertEquals(result, "");
  assertEquals(result.length, 0);
});

Deno.test("stash: preview truncation for very long content", async () => {
  resetStore();
  const veryLongContent = "z".repeat(200);
  await blob.setJSON("stash:u_trunc:long-entry", {
    content: veryLongContent,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  });
  const mod = (await import("./stash.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u_trunc",
    options: { subcommand: "list" },
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("..."));
  // Verify the full 200-char content is NOT displayed
  assert(!result.embed?.description?.includes("z".repeat(100)));
});

Deno.test("stash: empty list shows no entries message", async () => {
  resetStore();
  const mod = (await import("./stash.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u_empty_stash",
    options: { subcommand: "list" },
  } as any);
  assertEquals(result.success, true);
  assert(result.message?.includes("No stash entries"));
});
