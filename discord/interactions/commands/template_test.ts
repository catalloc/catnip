import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "@std/assert";
import { blob } from "../../../test/_mocks/blob.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { mockFetch, restoreFetch, getCalls } from "../../../test/_mocks/fetch.ts";
import { _internals } from "./template.ts";
import type { TemplateEntry } from "./template.ts";
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
        options: [{ name: "name", value: query, focused: true }],
      }],
    },
  };
}

function makeTemplate(overrides?: Partial<TemplateEntry>): TemplateEntry {
  return {
    title: "Test Title",
    description: "Test Description",
    createdBy: "u1",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

Deno.test("template _internals.sanitizeName: lowercases and strips invalid chars", () => {
  assertEquals(_internals.sanitizeName("Hello World!"), "helloworld");
  assertEquals(_internals.sanitizeName("my-template"), "my-template");
  assertEquals(_internals.sanitizeName("a".repeat(50)), "a".repeat(32));
});

Deno.test("template _internals.blobKey: correct format", () => {
  assertEquals(_internals.blobKey("g1", "test"), "template:g1:test");
});

Deno.test("template _internals.canSend: admin can always send", async () => {
  const entry = makeTemplate();
  const result = await _internals.canSend(entry, "g1", "u1", [], ADMIN_PERMISSIONS);
  assertEquals(result, true);
});

Deno.test("template _internals.canSend: no roles = admin-only", async () => {
  const entry = makeTemplate();
  const result = await _internals.canSend(entry, "g1", "u2", [], "0");
  assertEquals(result, false);
});

Deno.test("template _internals.canSend: allowed role grants access", async () => {
  const entry = makeTemplate({ allowedRoles: ["role1", "role2"] });
  const result = await _internals.canSend(entry, "g1", "u2", ["role1"], "0");
  assertEquals(result, true);
});

Deno.test("template _internals.canSend: wrong role denied", async () => {
  const entry = makeTemplate({ allowedRoles: ["role1"] });
  const result = await _internals.canSend(entry, "g1", "u2", ["role999"], "0");
  assertEquals(result, false);
});

Deno.test("template create: opens modal for admin", async () => {
  resetStore();
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "create", name: "test-template" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);
  assert(result.modal);
  assert(result.modal!.custom_id.includes("template-modal:create:g1:test-template"));
});

Deno.test("template create: rejects non-admin", async () => {
  resetStore();
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u2",
    options: { subcommand: "create", name: "test" },
    memberRoles: [],
    memberPermissions: "0",
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("admin"));
});

Deno.test("template create: rejects duplicate name", async () => {
  resetStore();
  await blob.setJSON("template:g1:test", makeTemplate());
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "create", name: "test" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("already exists"));
});

Deno.test("template create: enforces max templates", async () => {
  resetStore();
  for (let i = 0; i < 25; i++) {
    await blob.setJSON(`template:g1:tmpl${i}`, makeTemplate());
  }
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "create", name: "extra" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("Maximum"));
});

Deno.test("template edit: opens pre-filled modal", async () => {
  resetStore();
  await blob.setJSON("template:g1:test", makeTemplate({ color: 0x5865f2 }));
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "edit", name: "test" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);
  assert(result.modal);
  assert(result.modal!.custom_id.includes("template-modal:edit:g1:test"));
});

Deno.test("template edit: not found", async () => {
  resetStore();
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "edit", name: "nope" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("not found"));
});

Deno.test("template add-field: adds field to template", async () => {
  resetStore();
  await blob.setJSON("template:g1:test", makeTemplate());
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "add-field", name: "test", "field-name": "Info", "field-value": "Some info", inline: true },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);

  const entry = await blob.getJSON<TemplateEntry>("template:g1:test");
  assertEquals(entry?.fields?.length, 1);
  assertEquals(entry?.fields?.[0].name, "Info");
  assertEquals(entry?.fields?.[0].inline, true);
});

Deno.test("template remove-field: removes field", async () => {
  resetStore();
  await blob.setJSON("template:g1:test", makeTemplate({
    fields: [{ name: "Info", value: "data" }, { name: "Other", value: "stuff" }],
  }));
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "remove-field", name: "test", "field-name": "Info" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);

  const entry = await blob.getJSON<TemplateEntry>("template:g1:test");
  assertEquals(entry?.fields?.length, 1);
  assertEquals(entry?.fields?.[0].name, "Other");
});

Deno.test("template remove-field: field not found", async () => {
  resetStore();
  await blob.setJSON("template:g1:test", makeTemplate());
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "remove-field", name: "test", "field-name": "Nope" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("not found"));
});

Deno.test("template allow-role: adds role to allowed list", async () => {
  resetStore();
  await blob.setJSON("template:g1:test", makeTemplate());
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "allow-role", name: "test", role: "role1" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);

  const entry = await blob.getJSON<TemplateEntry>("template:g1:test");
  assert(entry?.allowedRoles?.includes("role1"));
});

Deno.test("template allow-role: duplicate role", async () => {
  resetStore();
  await blob.setJSON("template:g1:test", makeTemplate({ allowedRoles: ["role1"] }));
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "allow-role", name: "test", role: "role1" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("already"));
});

Deno.test("template deny-role: removes role from list", async () => {
  resetStore();
  await blob.setJSON("template:g1:test", makeTemplate({ allowedRoles: ["role1", "role2"] }));
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "deny-role", name: "test", role: "role1" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);

  const entry = await blob.getJSON<TemplateEntry>("template:g1:test");
  assertEquals(entry?.allowedRoles, ["role2"]);
});

Deno.test("template preview: shows embed", async () => {
  resetStore();
  await blob.setJSON("template:g1:test", makeTemplate({ color: 0xff0000, footer: "Test footer" }));
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "preview", name: "test" },
    memberRoles: [],
  } as any);
  assertEquals(result.success, true);
  assertEquals(result.embed?.title, "Test Title");
  assertEquals(result.embed?.description, "Test Description");
  assertEquals(result.embed?.color, 0xff0000);
  assertEquals(result.embed?.footer?.text, "Test footer");
});

Deno.test("template preview: not found", async () => {
  resetStore();
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "preview", name: "nope" },
    memberRoles: [],
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("not found"));
});

Deno.test("template send: admin sends to channel", async () => {
  resetStore();
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    await blob.setJSON("template:g1:test", makeTemplate());
    const mod = (await import("./template.ts")).default;
    const result = await mod.execute({
      guildId: "g1",
      userId: "u1",
      options: { subcommand: "send", name: "test", channelId: "ch1" },
      memberRoles: [],
      memberPermissions: ADMIN_PERMISSIONS,
    } as any);
    assertEquals(result.success, true);
    assert(result.message?.includes("sent"));

    const calls = getCalls();
    assert(calls.some((c) => c.url.includes("channels/ch1/messages")));
  } finally {
    restoreFetch();
  }
});

Deno.test("template send: role-gated user sends to current channel", async () => {
  resetStore();
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    await blob.setJSON("template:g1:test", makeTemplate({ allowedRoles: ["role1"] }));
    const mod = (await import("./template.ts")).default;
    const result = await mod.execute({
      guildId: "g1",
      userId: "u2",
      options: { subcommand: "send", name: "test", channelId: "ch1" },
      memberRoles: ["role1"],
      memberPermissions: "0",
    } as any);
    assertEquals(result.success, true);
  } finally {
    restoreFetch();
  }
});

Deno.test("template send: denied without permission", async () => {
  resetStore();
  await blob.setJSON("template:g1:test", makeTemplate());
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u2",
    options: { subcommand: "send", name: "test", channelId: "ch1" },
    memberRoles: [],
    memberPermissions: "0",
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("permission"));
});

Deno.test("template list: shows templates", async () => {
  resetStore();
  await blob.setJSON("template:g1:welcome", makeTemplate({ title: "Welcome" }));
  await blob.setJSON("template:g1:rules", makeTemplate({ title: "Rules", allowedRoles: ["role1"] }));
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "list" },
    memberRoles: [],
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("welcome"));
  assert(result.embed?.description?.includes("rules"));
  assert(result.embed?.description?.includes("admin-only"));
  assert(result.embed?.description?.includes("role1"));
});

Deno.test("template list: empty", async () => {
  resetStore();
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "list" },
    memberRoles: [],
  } as any);
  assertEquals(result.success, true);
  assert(result.message?.includes("No templates"));
});

Deno.test("template delete: admin deletes template", async () => {
  resetStore();
  await blob.setJSON("template:g1:test", makeTemplate());
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "delete", name: "test" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);
  assert(result.message?.includes("deleted"));

  const entry = await blob.getJSON("template:g1:test");
  assertEquals(entry, undefined);
});

Deno.test("template delete: non-admin rejected", async () => {
  resetStore();
  await blob.setJSON("template:g1:test", makeTemplate());
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u2",
    options: { subcommand: "delete", name: "test" },
    memberRoles: [],
    memberPermissions: "0",
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("admin"));
});

Deno.test("template delete: not found", async () => {
  resetStore();
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "delete", name: "nope" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("not found"));
});

Deno.test("template create: rejects invalid name", async () => {
  resetStore();
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "create", name: "!!!!" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("Invalid name"));
});

Deno.test("template add-field: not found", async () => {
  resetStore();
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "add-field", name: "nope", "field-name": "F", "field-value": "V" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("not found"));
});

Deno.test("template add-field: enforces 25-field limit", async () => {
  resetStore();
  const fields = Array.from({ length: 25 }, (_, i) => ({ name: `f${i}`, value: `v${i}` }));
  await blob.setJSON("template:g1:test", makeTemplate({ fields }));
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "add-field", name: "test", "field-name": "Extra", "field-value": "V" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("25 fields"));
});

Deno.test("template add-field: inline defaults to false", async () => {
  resetStore();
  await blob.setJSON("template:g1:test", makeTemplate());
  const mod = (await import("./template.ts")).default;
  await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "add-field", name: "test", "field-name": "NoInline", "field-value": "V" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  const entry = await blob.getJSON<TemplateEntry>("template:g1:test");
  assertEquals(entry?.fields?.[0].inline, false);
});

Deno.test("template remove-field: not found template", async () => {
  resetStore();
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "remove-field", name: "nope", "field-name": "F" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("not found"));
});

Deno.test("template allow-role: not found template", async () => {
  resetStore();
  const mod = (await import("./template.ts")).default;
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

Deno.test("template deny-role: not found template", async () => {
  resetStore();
  const mod = (await import("./template.ts")).default;
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

Deno.test("template deny-role: role not in list", async () => {
  resetStore();
  await blob.setJSON("template:g1:test", makeTemplate({ allowedRoles: ["role1"] }));
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "deny-role", name: "test", role: "role999" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("doesn't have"));
});

Deno.test("template send: not found", async () => {
  resetStore();
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "send", name: "nope", channelId: "ch1" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("not found"));
});

Deno.test("template send: API failure returns error", async () => {
  resetStore();
  mockFetch({ default: { status: 403, body: { message: "Missing Permissions" } } });
  try {
    await blob.setJSON("template:g1:test", makeTemplate());
    const mod = (await import("./template.ts")).default;
    const result = await mod.execute({
      guildId: "g1",
      userId: "u1",
      options: { subcommand: "send", name: "test", channelId: "ch1" },
      memberRoles: [],
      memberPermissions: ADMIN_PERMISSIONS,
    } as any);
    assertEquals(result.success, false);
    assert(result.error?.includes("Failed to send"));
  } finally {
    restoreFetch();
  }
});

Deno.test("template send: non-admin ignores channel override", async () => {
  resetStore();
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    await blob.setJSON("template:g1:test", makeTemplate({ allowedRoles: ["role1"] }));
    const mod = (await import("./template.ts")).default;
    const result = await mod.execute({
      guildId: "g1",
      userId: "u2",
      options: { subcommand: "send", name: "test", channel: "other-ch", channelId: "current-ch" },
      memberRoles: ["role1"],
      memberPermissions: "0",
    } as any);
    assertEquals(result.success, true);
    // Should use channelId (current channel), not the channel option
    const calls = getCalls();
    assert(calls.some((c) => c.url.includes("channels/current-ch/messages")));
    assert(!calls.some((c) => c.url.includes("channels/other-ch/messages")));
  } finally {
    restoreFetch();
  }
});

Deno.test("template send: admin can specify channel", async () => {
  resetStore();
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    await blob.setJSON("template:g1:test", makeTemplate());
    const mod = (await import("./template.ts")).default;
    const result = await mod.execute({
      guildId: "g1",
      userId: "u1",
      options: { subcommand: "send", name: "test", channel: "other-ch", channelId: "current-ch" },
      memberRoles: [],
      memberPermissions: ADMIN_PERMISSIONS,
    } as any);
    assertEquals(result.success, true);
    const calls = getCalls();
    assert(calls.some((c) => c.url.includes("channels/other-ch/messages")));
  } finally {
    restoreFetch();
  }
});

Deno.test("template preview: embed includes fields and image", async () => {
  resetStore();
  await blob.setJSON("template:g1:test", makeTemplate({
    fields: [{ name: "F1", value: "V1", inline: true }],
    imageUrl: "https://example.com/img.png",
  }));
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "preview", name: "test" },
    memberRoles: [],
  } as any);
  assertEquals(result.success, true);
  assertEquals(result.embed?.fields?.[0]?.name, "F1");
  assertEquals(result.embed?.image?.url, "https://example.com/img.png");
});

Deno.test("template: invalid subcommand returns error", async () => {
  resetStore();
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "invalid" },
    memberRoles: [],
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("subcommand"));
});

Deno.test("template autocomplete: returns all with empty query", async () => {
  resetStore();
  await blob.setJSON("template:ac-g1:welcome", makeTemplate());
  await blob.setJSON("template:ac-g1:rules", makeTemplate());
  const mod = (await import("./template.ts")).default;
  const resp = await mod.autocomplete!(autocompleteBody("ac-g1", ""), {});
  const data = await resp.json();
  assertEquals(data.type, InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT);
  assertEquals(data.data.choices.length, 2);
});

Deno.test("template autocomplete: filters by query", async () => {
  resetStore();
  await blob.setJSON("template:ac-g2:welcome", makeTemplate());
  await blob.setJSON("template:ac-g2:rules", makeTemplate());
  const mod = (await import("./template.ts")).default;
  const resp = await mod.autocomplete!(autocompleteBody("ac-g2", "wel"), {});
  const data = await resp.json();
  assertEquals(data.data.choices.length, 1);
  assertEquals(data.data.choices[0].value, "welcome");
});

Deno.test("template autocomplete: scoped to guild", async () => {
  resetStore();
  await blob.setJSON("template:ac-g3:mine", makeTemplate());
  await blob.setJSON("template:ac-g4:theirs", makeTemplate());
  const mod = (await import("./template.ts")).default;
  const resp = await mod.autocomplete!(autocompleteBody("ac-g3", ""), {});
  const data = await resp.json();
  assertEquals(data.data.choices.length, 1);
  assertEquals(data.data.choices[0].value, "mine");
});

// ── allow-user / deny-user tests ──

Deno.test("template _internals.canSend: allowed user grants access", async () => {
  const entry = makeTemplate({ allowedUsers: ["u5"] });
  const result = await _internals.canSend(entry, "g1", "u5", [], "0");
  assertEquals(result, true);
});

Deno.test("template _internals.canSend: wrong user denied when only other users allowed", async () => {
  const entry = makeTemplate({ allowedUsers: ["u5"] });
  const result = await _internals.canSend(entry, "g1", "u6", [], "0");
  assertEquals(result, false);
});

Deno.test("template allow-user: adds user to allowed list", async () => {
  resetStore();
  await blob.setJSON("template:g1:test", makeTemplate());
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "allow-user", name: "test", user: "u5" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);

  const entry = await blob.getJSON<TemplateEntry>("template:g1:test");
  assert(entry?.allowedUsers?.includes("u5"));
});

Deno.test("template allow-user: rejects duplicate user", async () => {
  resetStore();
  await blob.setJSON("template:g1:test", makeTemplate({ allowedUsers: ["u5"] }));
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "allow-user", name: "test", user: "u5" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("already"));
});

Deno.test("template allow-user: rejects non-admin", async () => {
  resetStore();
  await blob.setJSON("template:g1:test", makeTemplate());
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u2",
    options: { subcommand: "allow-user", name: "test", user: "u5" },
    memberRoles: [],
    memberPermissions: "0",
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("admin"));
});

Deno.test("template allow-user: template not found", async () => {
  resetStore();
  const mod = (await import("./template.ts")).default;
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

Deno.test("template deny-user: removes user from list", async () => {
  resetStore();
  await blob.setJSON("template:g1:test", makeTemplate({ allowedUsers: ["u5", "u6"] }));
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "deny-user", name: "test", user: "u5" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);

  const entry = await blob.getJSON<TemplateEntry>("template:g1:test");
  assertEquals(entry?.allowedUsers, ["u6"]);
});

Deno.test("template deny-user: user not in list", async () => {
  resetStore();
  await blob.setJSON("template:g1:test", makeTemplate({ allowedUsers: ["u5"] }));
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "deny-user", name: "test", user: "u999" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("doesn't have"));
});

Deno.test("template deny-user: template not found", async () => {
  resetStore();
  const mod = (await import("./template.ts")).default;
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

Deno.test("template send: user-gated user can send", async () => {
  resetStore();
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    await blob.setJSON("template:g1:test", makeTemplate({ allowedUsers: ["u5"] }));
    const mod = (await import("./template.ts")).default;
    const result = await mod.execute({
      guildId: "g1",
      userId: "u5",
      options: { subcommand: "send", name: "test", channelId: "ch1" },
      memberRoles: [],
      memberPermissions: "0",
    } as any);
    assertEquals(result.success, true);
  } finally {
    restoreFetch();
  }
});

Deno.test("template list: shows allowed users", async () => {
  resetStore();
  await blob.setJSON("template:g1:info", makeTemplate({ title: "Info", allowedUsers: ["u5"] }));
  await blob.setJSON("template:g1:combo", makeTemplate({ title: "Combo", allowedRoles: ["role1"], allowedUsers: ["u6"] }));
  const mod = (await import("./template.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "list" },
    memberRoles: [],
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("<@u5>"));
  assert(result.embed?.description?.includes("<@u6>"));
  assert(result.embed?.description?.includes("<@&role1>"));
});
