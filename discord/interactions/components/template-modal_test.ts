import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "@std/assert";
import { blob } from "../../../test/_mocks/blob.ts";
import type { TemplateEntry } from "../commands/template.ts";

function resetStore() {
  (blob as any)._reset();
}

Deno.test("template-modal create: saves new template", async () => {
  resetStore();
  const mod = (await import("./template-modal.ts")).default;
  const result = await mod.execute({
    customId: "template-modal:create:g1:test",
    guildId: "g1",
    userId: "u1",
    interaction: {},
    fields: {
      template_title: "My Title",
      template_description: "My description here",
      template_color: "#ff0000",
      template_footer: "Footer text",
      template_image_url: "https://example.com/image.png",
    },
  });
  assertEquals(result.success, true);
  assert(result.embed?.title?.includes("Created"));

  const entry = await blob.getJSON<TemplateEntry>("template:g1:test");
  assertEquals(entry?.title, "My Title");
  assertEquals(entry?.description, "My description here");
  assertEquals(entry?.color, 0xff0000);
  assertEquals(entry?.footer, "Footer text");
  assertEquals(entry?.imageUrl, "https://example.com/image.png");
});

Deno.test("template-modal create: saves without optional fields", async () => {
  resetStore();
  const mod = (await import("./template-modal.ts")).default;
  const result = await mod.execute({
    customId: "template-modal:create:g1:test",
    guildId: "g1",
    userId: "u1",
    interaction: {},
    fields: {
      template_title: "Just Title",
      template_description: "Just description",
      template_color: "",
      template_footer: "",
      template_image_url: "",
    },
  });
  assertEquals(result.success, true);

  const entry = await blob.getJSON<TemplateEntry>("template:g1:test");
  assertEquals(entry?.title, "Just Title");
  assertEquals(entry?.color, undefined);
  assertEquals(entry?.footer, undefined);
  assertEquals(entry?.imageUrl, undefined);
});

Deno.test("template-modal create: invalid color rejected", async () => {
  resetStore();
  const mod = (await import("./template-modal.ts")).default;
  const result = await mod.execute({
    customId: "template-modal:create:g1:test",
    guildId: "g1",
    userId: "u1",
    interaction: {},
    fields: {
      template_title: "Title",
      template_description: "Desc",
      template_color: "not-a-color",
      template_footer: "",
      template_image_url: "",
    },
  });
  assertEquals(result.success, false);
  assert(result.error?.includes("Invalid color"));
});

Deno.test("template-modal create: invalid URL rejected", async () => {
  resetStore();
  const mod = (await import("./template-modal.ts")).default;
  const result = await mod.execute({
    customId: "template-modal:create:g1:test",
    guildId: "g1",
    userId: "u1",
    interaction: {},
    fields: {
      template_title: "Title",
      template_description: "Desc",
      template_color: "",
      template_footer: "",
      template_image_url: "not-a-url",
    },
  });
  assertEquals(result.success, false);
  assert(result.error?.includes("Invalid image URL"));
});

Deno.test("template-modal create: missing title/description rejected", async () => {
  resetStore();
  const mod = (await import("./template-modal.ts")).default;
  const result = await mod.execute({
    customId: "template-modal:create:g1:test",
    guildId: "g1",
    userId: "u1",
    interaction: {},
    fields: {
      template_title: "",
      template_description: "",
      template_color: "",
      template_footer: "",
      template_image_url: "",
    },
  });
  assertEquals(result.success, false);
  assert(result.error?.includes("required"));
});

Deno.test("template-modal edit: updates existing template", async () => {
  resetStore();
  await blob.setJSON("template:g1:test", {
    title: "Old Title",
    description: "Old desc",
    color: 0x000000,
    footer: "Old footer",
    allowedRoles: ["role1"],
    createdBy: "u1",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  });

  const mod = (await import("./template-modal.ts")).default;
  const result = await mod.execute({
    customId: "template-modal:edit:g1:test",
    guildId: "g1",
    userId: "u1",
    interaction: {},
    fields: {
      template_title: "New Title",
      template_description: "New desc",
      template_color: "#5865f2",
      template_footer: "New footer",
      template_image_url: "",
    },
  });
  assertEquals(result.success, true);
  assert(result.embed?.title?.includes("Updated"));

  const entry = await blob.getJSON<TemplateEntry>("template:g1:test");
  assertEquals(entry?.title, "New Title");
  assertEquals(entry?.description, "New desc");
  assertEquals(entry?.color, 0x5865f2);
  assertEquals(entry?.footer, "New footer");
  assertEquals(entry?.imageUrl, undefined);
  // Preserved fields
  assertEquals(entry?.allowedRoles, ["role1"]);
  assertEquals(entry?.createdAt, "2024-01-01T00:00:00.000Z");
});

Deno.test("template-modal edit: not found", async () => {
  resetStore();
  const mod = (await import("./template-modal.ts")).default;
  const result = await mod.execute({
    customId: "template-modal:edit:g1:nope",
    guildId: "g1",
    userId: "u1",
    interaction: {},
    fields: {
      template_title: "Title",
      template_description: "Desc",
      template_color: "",
      template_footer: "",
      template_image_url: "",
    },
  });
  assertEquals(result.success, false);
  assert(result.error?.includes("not found"));
});

Deno.test("template-modal: color without hash works", async () => {
  resetStore();
  const mod = (await import("./template-modal.ts")).default;
  const result = await mod.execute({
    customId: "template-modal:create:g1:test",
    guildId: "g1",
    userId: "u1",
    interaction: {},
    fields: {
      template_title: "Title",
      template_description: "Desc",
      template_color: "5865f2",
      template_footer: "",
      template_image_url: "",
    },
  });
  assertEquals(result.success, true);

  const entry = await blob.getJSON<TemplateEntry>("template:g1:test");
  assertEquals(entry?.color, 0x5865f2);
});
