import "../../test/_mocks/env.ts";
import { assert, assertEquals } from "@std/assert";
import { _internals } from "./send.ts";

const { truncateText, splitMessage, calculateEmbedSize, sanitizeEmbed, chunkEmbeds, DISCORD_LIMITS } = _internals;

// --- truncateText ---

Deno.test("truncateText: undefined returns undefined", () => {
  assertEquals(truncateText(undefined, 100), undefined);
});

Deno.test("truncateText: short text unchanged", () => {
  assertEquals(truncateText("hello", 100), "hello");
});

Deno.test("truncateText: long text truncated with ellipsis", () => {
  const result = truncateText("a".repeat(200), 100);
  assertEquals(result!.length, 100);
  assert(result!.endsWith("..."));
});

// --- splitMessage ---

Deno.test("splitMessage: empty string returns empty array", () => {
  assertEquals(splitMessage(""), []);
});

Deno.test("splitMessage: short message returns single chunk", () => {
  assertEquals(splitMessage("hello"), ["hello"]);
});

Deno.test("splitMessage: long message splits into chunks", () => {
  const msg = "a".repeat(5000);
  const chunks = splitMessage(msg);
  assert(chunks.length > 1);
  for (const chunk of chunks) {
    assert(chunk.length <= DISCORD_LIMITS.contentLength);
  }
  assertEquals(chunks.join(""), msg);
});

Deno.test("splitMessage: prefers splitting on newlines", () => {
  const line = "x".repeat(1500);
  const msg = `${line}\n${line}\n${line}`;
  const chunks = splitMessage(msg);
  assert(chunks.length >= 2);
});

Deno.test("splitMessage: splits on spaces when no newlines available", () => {
  // Words separated by spaces, no newlines — should split at a space boundary
  const word = "word ";
  const msg = word.repeat(500); // 2500 chars, over 2000 limit
  const chunks = splitMessage(msg);
  assert(chunks.length >= 2);
  for (const chunk of chunks) {
    assert(chunk.length <= DISCORD_LIMITS.contentLength);
  }
  assertEquals(chunks.join(""), msg);
});

// --- calculateEmbedSize ---

Deno.test("calculateEmbedSize: title + description", () => {
  assertEquals(calculateEmbedSize({ title: "abc", description: "defgh" }), 8);
});

Deno.test("calculateEmbedSize: with fields", () => {
  const size = calculateEmbedSize({
    title: "T",
    fields: [{ name: "N", value: "V" }],
  });
  assertEquals(size, 3); // "T" + "N" + "V"
});

Deno.test("calculateEmbedSize: with footer and author", () => {
  const size = calculateEmbedSize({
    footer: { text: "foot" },
    author: { name: "auth" },
  });
  assertEquals(size, 8); // "foot" + "auth"
});

// --- sanitizeEmbed ---

Deno.test("sanitizeEmbed: truncates long title", () => {
  const result = sanitizeEmbed({ title: "a".repeat(300) });
  assert(result.title!.length <= DISCORD_LIMITS.title);
});

Deno.test("sanitizeEmbed: truncates long description", () => {
  const result = sanitizeEmbed({ description: "a".repeat(5000) });
  assert(result.description!.length <= DISCORD_LIMITS.description);
});

Deno.test("sanitizeEmbed: limits fields to 25", () => {
  const fields = Array.from({ length: 30 }, (_, i) => ({ name: `f${i}`, value: `v${i}` }));
  const result = sanitizeEmbed({ fields });
  assertEquals(result.fields!.length, 25);
});

Deno.test("sanitizeEmbed: preserves color and url", () => {
  const result = sanitizeEmbed({ color: 0xff0000, url: "https://example.com" });
  assertEquals(result.color, 0xff0000);
  assertEquals(result.url, "https://example.com");
});

Deno.test("sanitizeEmbed: truncates author name and footer text", () => {
  const result = sanitizeEmbed({
    author: { name: "a".repeat(300) },
    footer: { text: "f".repeat(3000) },
  });
  assert(result.author!.name.length <= DISCORD_LIMITS.authorName);
  assert(result.footer!.text.length <= DISCORD_LIMITS.footerText);
});

Deno.test("sanitizeEmbed: empty field name/value gets zero-width space", () => {
  const result = sanitizeEmbed({
    fields: [{ name: "", value: "" }],
  });
  assertEquals(result.fields![0].name, "\u200B");
  assertEquals(result.fields![0].value, "\u200B");
});

// --- chunkEmbeds ---

Deno.test("chunkEmbeds: empty returns empty", () => {
  assertEquals(chunkEmbeds([]), []);
});

Deno.test("chunkEmbeds: single embed returns one chunk", () => {
  const result = chunkEmbeds([{ title: "test" }]);
  assertEquals(result.length, 1);
  assertEquals(result[0].length, 1);
});

Deno.test("chunkEmbeds: 11 embeds splits by embedsPerMessage limit", () => {
  const embeds = Array.from({ length: 11 }, (_, i) => ({ title: `E${i}` }));
  const result = chunkEmbeds(embeds);
  assertEquals(result.length, 2);
  assertEquals(result[0].length, 10);
  assertEquals(result[1].length, 1);
});

Deno.test("chunkEmbeds: splits when total characters exceed 6000", () => {
  // Each embed ~3100 chars in description — two should exceed the 6000 char limit
  const bigEmbed = { description: "x".repeat(3100) };
  const result = chunkEmbeds([bigEmbed, bigEmbed, bigEmbed]);
  assert(result.length >= 2);
  // Each chunk's total size should be within limits
  for (const chunk of result) {
    const totalSize = chunk.reduce((sum, e) => sum + calculateEmbedSize(e), 0);
    assert(totalSize <= DISCORD_LIMITS.totalCharacters);
  }
});
