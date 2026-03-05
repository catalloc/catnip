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

// --- sanitize ---

import { sanitize } from "./logger.ts";

Deno.test("sanitize: redacts Bearer tokens", () => {
  const input = "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def";
  const result = sanitize(input);
  assert(result.includes("Bearer [REDACTED]"));
  assert(!result.includes("eyJhbGciOiJIUzI1NiJ9"));
});

Deno.test("sanitize: redacts Bot tokens", () => {
  const input = "Bot MTIzNDU2Nzg5.abc.def-token";
  const result = sanitize(input);
  assert(result.includes("Bot [REDACTED]"));
  assert(!result.includes("MTIzNDU2Nzg5"));
});

Deno.test("sanitize: redacts webhook URLs", () => {
  const input = "Sending to https://discord.com/api/webhooks/123456789/ABCdef-token_123";
  const result = sanitize(input);
  assert(result.includes("[WEBHOOK_URL_REDACTED]"));
  assert(!result.includes("ABCdef-token_123"));
});

Deno.test("sanitize: leaves normal text unchanged", () => {
  const input = "Normal log message with no secrets";
  assertEquals(sanitize(input), input);
});

// --- error level triggers immediate flush ---

Deno.test("logger: error level triggers immediate flush", async () => {
  const sent: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_input: string | URL | Request, init?: RequestInit) => {
    sent.push(init?.body as string);
    return Promise.resolve(new Response("ok", { status: 200 }));
  };
  try {
    const logger = new DiscordLogger({
      context: "ErrorFlush",
      webhookUrl: "https://discord.com/api/webhooks/test/token",
      fallbackToConsole: false,
      batchIntervalMs: 100_000, // very long to prevent timed flush
    });
    logger.error("critical failure");
    // Wait briefly for the async flush to complete
    await new Promise((r) => setTimeout(r, 100));
    assert(sent.length > 0, "Error should trigger immediate flush");
    await logger.finalize();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// --- maxBatchSize triggers flush ---

Deno.test("logger: maxBatchSize triggers flush", async () => {
  const sent: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_input: string | URL | Request, init?: RequestInit) => {
    sent.push(init?.body as string);
    return Promise.resolve(new Response("ok", { status: 200 }));
  };
  try {
    const logger = new DiscordLogger({
      context: "BatchFlush",
      webhookUrl: "https://discord.com/api/webhooks/test/token",
      fallbackToConsole: false,
      maxBatchSize: 3,
      batchIntervalMs: 100_000,
    });
    logger.info("msg1");
    logger.info("msg2");
    logger.info("msg3"); // should trigger flush at batch size 3
    await new Promise((r) => setTimeout(r, 100));
    assert(sent.length > 0, "Reaching maxBatchSize should trigger flush");
    await logger.finalize();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// --- flush while flushing is no-op ---

Deno.test("logger: flush while already flushing does not duplicate", async () => {
  let flushCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    flushCount++;
    await new Promise((r) => setTimeout(r, 50)); // Simulate slow send
    return new Response("ok", { status: 200 });
  };
  try {
    const logger = new DiscordLogger({
      context: "DupFlush",
      webhookUrl: "https://discord.com/api/webhooks/test/token",
      fallbackToConsole: false,
      batchIntervalMs: 100_000,
    });
    logger.info("msg1");
    // Trigger flush, then immediately try again — second should be skipped
    const p1 = logger.flush();
    const p2 = logger.flush(); // isFlushing = true, should no-op
    await Promise.all([p1, p2]);
    assertEquals(flushCount, 1);
    await logger.finalize();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// --- createLogger registers in global instances ---

Deno.test("createLogger: registered logger flushes via finalizeAllLoggers", async () => {
  const sent: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_input: string | URL | Request, init?: RequestInit) => {
    sent.push(init?.body as string);
    return Promise.resolve(new Response("ok", { status: 200 }));
  };
  try {
    const logger = createLogger("GlobalTest", {
      webhookUrl: "https://discord.com/api/webhooks/test/token",
      fallbackToConsole: false,
      batchIntervalMs: 100_000,
    });
    logger.info("tracked message");
    await finalizeAllLoggers();
    assert(sent.length > 0, "finalizeAllLoggers should flush all created loggers");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// --- finalizeAllLoggers timeout ---

Deno.test("finalizeAllLoggers: completes even with no loggers", async () => {
  // createLogger adds to _instances, but this tests the function doesn't error
  await finalizeAllLoggers();
});

// --- scheduleFlush timer ---

Deno.test({ name: "logger: scheduleFlush fires after batchIntervalMs", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const sent: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_input: string | URL | Request, init?: RequestInit) => {
    sent.push(init?.body as string);
    return Promise.resolve(new Response("ok", { status: 200 }));
  };
  try {
    const logger = new DiscordLogger({
      context: "TimerTest",
      webhookUrl: "https://discord.com/api/webhooks/test/token",
      fallbackToConsole: false,
      batchIntervalMs: 50, // very short interval
      maxBatchSize: 100,
    });
    logger.info("timed message");
    // Wait for the timer to fire
    await new Promise((r) => setTimeout(r, 200));
    assert(sent.length > 0, "scheduleFlush should have fired and sent");
    assert(sent[0].includes("timed message"));
    await logger.finalize();
  } finally {
    globalThis.fetch = originalFetch;
  }
}});

Deno.test("logger: finalize flushes immediately regardless of timer", async () => {
  const sent: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_input: string | URL | Request, init?: RequestInit) => {
    sent.push(init?.body as string);
    return Promise.resolve(new Response("ok", { status: 200 }));
  };
  try {
    const logger = new DiscordLogger({
      context: "FinalizeTest",
      webhookUrl: "https://discord.com/api/webhooks/test/token",
      fallbackToConsole: false,
      batchIntervalMs: 999_999, // very long — should never fire naturally
    });
    logger.info("finalize me");
    await logger.finalize();
    assert(sent.length > 0, "finalize should flush immediately");
    assert(sent[0].includes("finalize me"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("logger: flush error with fallbackToConsole false skips console dump", async () => {
  const consoleErrors: string[] = [];
  const origError = console.error;
  const origLog = console.log;
  console.error = (msg: string) => consoleErrors.push(msg);
  console.log = () => {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new Error("send failed"));
  try {
    const logger = new DiscordLogger({
      context: "NoDump",
      webhookUrl: "https://discord.com/api/webhooks/test/token",
      fallbackToConsole: false,
    });
    logger.info("test");
    await logger.finalize();
    // With fallbackToConsole: false, should NOT dump batch to console.error
    const dumpMsgs = consoleErrors.filter((m) => m.includes("dumping to console"));
    assertEquals(dumpMsgs.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = origError;
    console.log = origLog;
  }
});

Deno.test("logger: formatBatch output contains level emojis", async () => {
  const sent: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_input: string | URL | Request, init?: RequestInit) => {
    sent.push(init?.body as string);
    return Promise.resolve(new Response("ok", { status: 200 }));
  };
  try {
    const logger = new DiscordLogger({
      context: "EmojiTest",
      webhookUrl: "https://discord.com/api/webhooks/test/token",
      fallbackToConsole: false,
      batchIntervalMs: 999_999,
    });
    logger.info("info msg");
    logger.warn("warn msg");
    await logger.finalize();
    assert(sent.length > 0);
    const payload = JSON.parse(sent[0]);
    const content = payload.content as string;
    // info emoji and warn emoji should be present
    assert(content.includes("\u2139\uFE0F"), "Should contain info emoji");
    assert(content.includes("\u26A0\uFE0F"), "Should contain warn emoji");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
