import "../../test/_mocks/env.ts";
import { assert, assertEquals } from "../../test/assert.ts";
import { _internals, send } from "./send.ts";

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

// --- send() integration / partialFailure ---

Deno.test("send: single chunk success has no partialFailure", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify({ id: "1" }), { status: 200 }));
  try {
    const result = await send("short message", "https://discord.com/api/webhooks/test/token");
    assertEquals(result.success, true);
    assertEquals(result.partialFailure, false);
    assertEquals(result.sentDirectly, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("send: all chunks succeed — no partialFailure", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify({ id: "1" }), { status: 200 }));
  try {
    // Message long enough to split into multiple chunks
    const longMsg = "x".repeat(4500);
    const result = await send(longMsg, "https://discord.com/api/webhooks/test/token");
    assertEquals(result.success, true);
    assertEquals(result.partialFailure, false);
    assert(result.totalChunks! >= 2, "Should have multiple chunks");
    assertEquals(result.sentDirectly, result.totalChunks);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("send: first chunk succeeds, second fails — partialFailure is true", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = () => {
    callCount++;
    // First two calls succeed (initial send + rate limit retry = 2 per chunk, but we have 1 success)
    // Actually sendWithFallback calls sendToDiscordApi which has its own retry loop
    // First chunk succeeds, second chunk fails
    if (callCount <= 1) {
      return Promise.resolve(new Response(JSON.stringify({ id: "1" }), { status: 200 }));
    }
    return Promise.resolve(new Response("Bad Request", { status: 400 }));
  };
  try {
    const longMsg = "x".repeat(4500); // splits into 3 chunks
    const result = await send(longMsg, "https://discord.com/api/webhooks/test/token");
    assertEquals(result.success, true);
    assertEquals(result.partialFailure, true);
    assertEquals(result.sentDirectly, 1);
    assert(result.totalChunks! >= 2);
    assert(result.error !== undefined, "Should have error describing failed chunk");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("send: all chunks fail — partialFailure is false", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response("Bad Request", { status: 400 }));
  try {
    const result = await send("short message", "https://discord.com/api/webhooks/test/token");
    assertEquals(result.success, false);
    // partialFailure should be false (or undefined) when nothing succeeded
    assert(!result.partialFailure, "Should not be partial failure when nothing sent");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// --- embed >6000 chars gets chunked ---

Deno.test("chunkEmbeds: large embeds >6000 chars split into multiple chunks", () => {
  // 3 embeds each with ~2500 char descriptions = 7500 total
  const bigEmbed = { description: "y".repeat(2500) };
  const result = chunkEmbeds([bigEmbed, bigEmbed, bigEmbed]);
  assert(result.length >= 2, "Should split into at least 2 chunks");
  for (const chunk of result) {
    const totalSize = chunk.reduce((sum, e) => sum + calculateEmbedSize(e), 0);
    assert(totalSize <= DISCORD_LIMITS.totalCharacters, `Chunk exceeds ${DISCORD_LIMITS.totalCharacters} chars`);
  }
});

// --- sanitizeEmbed truncates field name and value ---

Deno.test("sanitizeEmbed: truncates field name to 256 and value to 1024", () => {
  const result = sanitizeEmbed({
    fields: [{ name: "x".repeat(300), value: "v".repeat(1500) }],
  });
  assert(result.fields![0].name.length <= DISCORD_LIMITS.fieldName);
  assert(result.fields![0].value.length <= DISCORD_LIMITS.fieldValue);
  assert(result.fields![0].name.endsWith("..."));
  assert(result.fields![0].value.endsWith("..."));
});

// --- send with embed array ---

Deno.test("send: single embed sends successfully", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify({ id: "1" }), { status: 200 }));
  try {
    const result = await send({ title: "Test", description: "Hello" }, "https://discord.com/api/webhooks/test/token");
    assertEquals(result.success, true);
    assertEquals(result.sentDirectly, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// --- send with no webhook URL ---

Deno.test("send: no webhook URL returns error", async () => {
  // Save and clear the config webhook
  const origEnv = Deno.env.get("DISCORD_CONSOLE_WEBHOOK");
  Deno.env.delete("DISCORD_CONSOLE_WEBHOOK");
  try {
    const result = await send("test", undefined);
    assertEquals(result.success, false);
    assert(result.error?.includes("No webhook URL"));
  } finally {
    if (origEnv) Deno.env.set("DISCORD_CONSOLE_WEBHOOK", origEnv);
  }
});

// --- fallback webhook on 4xx ---

Deno.test("send: fallback webhook used on 4xx from primary", async () => {
  const origEnv = Deno.env.get("DISCORD_CONSOLE");
  Deno.env.set("DISCORD_CONSOLE", "https://discord.com/api/webhooks/fallback/token");
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = (input: string | URL | Request) => {
    callCount++;
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("primary")) {
      return Promise.resolve(new Response("Not Found", { status: 404 }));
    }
    return Promise.resolve(new Response(JSON.stringify({ id: "fb1" }), { status: 200 }));
  };
  try {
    const result = await send("test message", "https://discord.com/api/webhooks/primary/token");
    assertEquals(result.success, true);
    assertEquals(result.usedFallback, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (origEnv) Deno.env.set("DISCORD_CONSOLE", origEnv);
    else Deno.env.delete("DISCORD_CONSOLE");
  }
});

// --- 429 rate limit retry in sendChunked ---

Deno.test({ name: "send: 429 rate limit retries in sendChunked", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = () => {
    callCount++;
    if (callCount === 1) {
      return Promise.resolve(new Response("rate limited", {
        status: 429,
        headers: { "Retry-After": "0.01" },
      }));
    }
    return Promise.resolve(new Response(JSON.stringify({ id: "1" }), { status: 200 }));
  };
  try {
    const result = await send("short msg", "https://discord.com/api/webhooks/test/token");
    assertEquals(result.success, true);
    assert(callCount >= 2, "Should have retried after 429");
  } finally {
    globalThis.fetch = originalFetch;
  }
}});

// --- network error returns failure ---

Deno.test("send: network error returns failure", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new Error("network down"));
  try {
    const result = await send("msg", "https://discord.com/api/webhooks/test/token");
    assertEquals(result.success, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// --- string content splits into correct payload ---

Deno.test("send: string content splits into correct payload", async () => {
  const originalFetch = globalThis.fetch;
  const bodies: string[] = [];
  globalThis.fetch = (_input: string | URL | Request, init?: RequestInit) => {
    bodies.push(init?.body as string);
    return Promise.resolve(new Response(JSON.stringify({ id: "1" }), { status: 200 }));
  };
  try {
    const result = await send("hello world", "https://discord.com/api/webhooks/test/token");
    assertEquals(result.success, true);
    assert(bodies.length > 0);
    const payload = JSON.parse(bodies[0]);
    assertEquals(payload.content, "hello world");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
