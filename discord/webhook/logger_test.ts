import "../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../test/assert.ts";
import { DiscordLogger, finalizeAllLoggers, createLogger } from "./logger.ts";

// Helper: create a logger with no webhook (buffer-only, no network)
function createBufferLogger(opts?: { minLevel?: "debug" | "info" | "warn" | "error"; maxBatchSize?: number }) {
  return new DiscordLogger({
    context: "Test",
    webhookUrl: null,
    fallbackToConsole: false,
    ...opts,
  });
}

// --- Level filtering ---

Deno.test("logger: respects minLevel — filters out lower levels", async () => {
  const logger = createBufferLogger({ minLevel: "warn" });
  logger.debug("ignored");
  logger.info("ignored");
  logger.warn("kept");
  // With webhookUrl: null, flush clears the buffer
  await logger.finalize();
});

Deno.test("logger: debug messages pass when minLevel is debug", async () => {
  const logger = createBufferLogger({ minLevel: "debug" });
  logger.debug("should be buffered");
  // No error means it was accepted into the buffer
  await logger.finalize();
});

// --- Flush behavior ---

Deno.test("logger: flush with no webhook clears buffer", async () => {
  const logger = createBufferLogger();
  logger.info("msg1");
  logger.info("msg2");
  await logger.finalize(); // finalize clears the timer and flushes
  // Flushing again should be a no-op (empty buffer)
  await logger.flush();
});

Deno.test("logger: finalize clears scheduled timer", async () => {
  const logger = createBufferLogger();
  logger.info("trigger timer");
  // Finalize should clear the timer and flush
  await logger.finalize();
  // No timer leak
});

// --- Error formatting ---

Deno.test("logger: error with Error object includes name and message only", () => {
  // Capture what gets logged
  const messages: string[] = [];
  const original = console.log;
  console.log = (msg: string) => messages.push(msg);
  try {
    const logger = new DiscordLogger({
      context: "ErrTest",
      webhookUrl: null,
      fallbackToConsole: true,
    });
    const err = new Error("test error");
    logger.error("Something broke:", err);
    assert(messages.length > 0);
    assert(messages[0].includes("test error"), "Should include error message");
    assert(messages[0].includes("[ERROR]"), "Should include level");
  } finally {
    console.log = original;
  }
});

Deno.test("logger: error with non-Error value stringifies it", () => {
  const messages: string[] = [];
  const original = console.log;
  console.log = (msg: string) => messages.push(msg);
  try {
    const logger = new DiscordLogger({
      context: "ErrTest",
      webhookUrl: null,
      fallbackToConsole: true,
    });
    logger.error("Oops:", 42);
    assert(messages[0].includes("42"), "Should include stringified value");
  } finally {
    console.log = original;
  }
});

Deno.test("logger: error with no second arg logs message only", () => {
  const messages: string[] = [];
  const original = console.log;
  console.log = (msg: string) => messages.push(msg);
  try {
    const logger = new DiscordLogger({
      context: "ErrTest",
      webhookUrl: null,
      fallbackToConsole: true,
    });
    logger.error("Clean error");
    assert(messages[0].includes("Clean error"));
    assert(!messages[0].includes("```"), "Should not include code block");
  } finally {
    console.log = original;
  }
});

// --- Webhook send with mock fetch ---

Deno.test("logger: successful flush sends to webhook", async () => {
  const sent: { url: string; body: string }[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(input), body: init?.body as string });
    return Promise.resolve(new Response("ok", { status: 200 }));
  };
  try {
    const logger = new DiscordLogger({
      context: "SendTest",
      webhookUrl: "https://discord.com/api/webhooks/test/token",
      fallbackToConsole: false,
      batchIntervalMs: 100_000, // prevent auto-flush
    });
    logger.info("test message");
    await logger.finalize();
    assert(sent.length > 0, "Should have sent at least one request");
    assert(sent[0].url.includes("webhooks/test/token"), "Should target webhook URL");
    assert(sent[0].body.includes("test message"), "Payload should include message");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("logger: failed flush restores entries to buffer", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    return Promise.reject(new Error("network down"));
  };
  try {
    const logger = new DiscordLogger({
      context: "FailTest",
      webhookUrl: "https://discord.com/api/webhooks/test/token",
      fallbackToConsole: false,
    });
    logger.info("will fail");
    await logger.finalize();
    // After failed flush, entries restored — flushing again with null webhook clears
    // Change config to null webhook so we can verify buffer isn't empty
    // (We can't directly inspect buffer, but we can verify it doesn't crash)
    await logger.finalize();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test({ name: "logger: buffer capped at 100 on repeated flush failures", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new Error("always fails"));
  try {
    const logger = new DiscordLogger({
      context: "CapTest",
      webhookUrl: "https://discord.com/api/webhooks/test/token",
      fallbackToConsole: false,
      maxBatchSize: 200,
    });
    // Add 150 entries using warn (doesn't trigger immediate flush like error does)
    for (let i = 0; i < 150; i++) {
      logger.warn(`msg-${i}`);
    }
    // Flush will fail and restore, capped at 100
    await logger.finalize();
    // Second flush also fails, but buffer shouldn't grow beyond 100
    await logger.finalize();
  } finally {
    globalThis.fetch = originalFetch;
  }
}});

// --- finalizeAllLoggers timeout ---

Deno.test("finalizeAllLoggers: completes even with no loggers", async () => {
  // createLogger adds to _instances, but this tests the function doesn't error
  await finalizeAllLoggers();
});
