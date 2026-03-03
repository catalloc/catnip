import "../../test/_mocks/env.ts";
import { assertEquals, assertNotStrictEquals } from "@std/assert";
import { EmbedBuilder, embed } from "./embed-builder.ts";
import { EmbedColors } from "../constants.ts";

Deno.test("EmbedBuilder: fluent chaining sets fields", () => {
  const result = new EmbedBuilder()
    .title("My Title")
    .description("My Desc")
    .color(0xff0000)
    .build();
  assertEquals(result.title, "My Title");
  assertEquals(result.description, "My Desc");
  assertEquals(result.color, 0xff0000);
});

Deno.test("EmbedBuilder: field method adds fields", () => {
  const result = new EmbedBuilder()
    .field("Name", "Value", true)
    .field("Name2", "Value2")
    .build();
  assertEquals(result.fields?.length, 2);
  assertEquals(result.fields?.[0], { name: "Name", value: "Value", inline: true });
});

Deno.test("EmbedBuilder: success preset sets color and description", () => {
  const result = new EmbedBuilder().success("It worked!").build();
  assertEquals(result.color, EmbedColors.SUCCESS);
  assertEquals(result.description, "It worked!");
});

Deno.test("EmbedBuilder: build returns a shallow copy", () => {
  const builder = new EmbedBuilder().title("Test");
  const a = builder.build();
  const b = builder.build();
  assertNotStrictEquals(a, b);
  assertEquals(a, b);
});

Deno.test("EmbedBuilder: url method", () => {
  const result = new EmbedBuilder().url("https://example.com").build();
  assertEquals(result.url, "https://example.com");
});

Deno.test("EmbedBuilder: footer with and without icon", () => {
  const withIcon = new EmbedBuilder().footer("foot", "https://icon.png").build();
  assertEquals(withIcon.footer, { text: "foot", icon_url: "https://icon.png" });

  const noIcon = new EmbedBuilder().footer("foot").build();
  assertEquals(noIcon.footer, { text: "foot", icon_url: undefined });
});

Deno.test("EmbedBuilder: image method", () => {
  const result = new EmbedBuilder().image("https://img.png").build();
  assertEquals(result.image, { url: "https://img.png" });
});

Deno.test("EmbedBuilder: thumbnail method", () => {
  const result = new EmbedBuilder().thumbnail("https://thumb.png").build();
  assertEquals(result.thumbnail, { url: "https://thumb.png" });
});

Deno.test("EmbedBuilder: author with all params", () => {
  const result = new EmbedBuilder()
    .author("AuthorName", "https://author.url", "https://author-icon.png")
    .build();
  assertEquals(result.author, {
    name: "AuthorName",
    url: "https://author.url",
    icon_url: "https://author-icon.png",
  });
});

Deno.test("EmbedBuilder: timestamp with explicit ISO string", () => {
  const result = new EmbedBuilder().timestamp("2025-01-01T00:00:00.000Z").build();
  assertEquals(result.timestamp, "2025-01-01T00:00:00.000Z");
});

Deno.test("EmbedBuilder: timestamp defaults to current time", () => {
  const before = new Date().toISOString();
  const result = new EmbedBuilder().timestamp().build();
  const after = new Date().toISOString();
  assertEquals(result.timestamp! >= before, true);
  assertEquals(result.timestamp! <= after, true);
});

Deno.test("EmbedBuilder: error preset", () => {
  const result = new EmbedBuilder().error("Failed!").build();
  assertEquals(result.color, EmbedColors.ERROR);
  assertEquals(result.description, "Failed!");
});

Deno.test("EmbedBuilder: info preset", () => {
  const result = new EmbedBuilder().info("Note").build();
  assertEquals(result.color, EmbedColors.INFO);
  assertEquals(result.description, "Note");
});

Deno.test("EmbedBuilder: warning preset", () => {
  const result = new EmbedBuilder().warning("Careful!").build();
  assertEquals(result.color, EmbedColors.WARNING);
  assertEquals(result.description, "Careful!");
});

Deno.test("embed: factory returns EmbedBuilder instance", () => {
  const builder = embed();
  assertEquals(builder instanceof EmbedBuilder, true);
});
