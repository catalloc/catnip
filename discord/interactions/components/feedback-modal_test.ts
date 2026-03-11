import "../../../test/_mocks/env.ts";
import "../../../test/_mocks/sqlite.ts";
import { assertEquals, assertStringIncludes } from "../../../test/assert.ts";
import { mockFetch, restoreFetch } from "../../../test/_mocks/fetch.ts";
import handler from "./feedback-modal.ts";

Deno.test("feedback-modal: successful webhook send returns success embed", async () => {
  Deno.env.set("FEEDBACK_WEBHOOK", "https://discord.com/api/webhooks/test/test");
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    const result = await handler.execute({
      fields: { feedback_topic: "Bug", feedback_details: "Something broke" },
      userId: "u1",
    } as any);
    assertEquals(result.success, true);
    assertEquals(result.embed!.title, "Feedback Received");
    assertStringIncludes(result.embed!.description!, "u1");
    assertEquals(result.embed!.fields![0].value, "Bug");
    assertEquals(result.embed!.fields![1].value, "Something broke");
  } finally {
    restoreFetch();
    Deno.env.delete("FEEDBACK_WEBHOOK");
  }
});

Deno.test("feedback-modal: failed webhook returns error", async () => {
  Deno.env.set("FEEDBACK_WEBHOOK", "https://discord.com/api/webhooks/test/test");
  mockFetch({ default: { status: 500, body: "Internal Server Error" } });
  try {
    const result = await handler.execute({
      fields: { feedback_topic: "Bug", feedback_details: "Details" },
      userId: "u1",
    } as any);
    assertEquals(result.success, false);
    assertStringIncludes(result.error!, "Failed to submit");
  } finally {
    restoreFetch();
    Deno.env.delete("FEEDBACK_WEBHOOK");
  }
});

Deno.test("feedback-modal: topic truncated to 256 chars", async () => {
  Deno.env.set("FEEDBACK_WEBHOOK", "https://discord.com/api/webhooks/test/test");
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    const longTopic = "A".repeat(300);
    const result = await handler.execute({
      fields: { feedback_topic: longTopic, feedback_details: "ok" },
      userId: "u1",
    } as any);
    assertEquals(result.success, true);
    assertEquals(result.embed!.fields![0].value.length, 256);
  } finally {
    restoreFetch();
    Deno.env.delete("FEEDBACK_WEBHOOK");
  }
});

Deno.test("feedback-modal: details truncated to 1024 chars", async () => {
  Deno.env.set("FEEDBACK_WEBHOOK", "https://discord.com/api/webhooks/test/test");
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    const longDetails = "B".repeat(1100);
    const result = await handler.execute({
      fields: { feedback_topic: "ok", feedback_details: longDetails },
      userId: "u1",
    } as any);
    assertEquals(result.success, true);
    assertEquals(result.embed!.fields![1].value.length, 1024);
  } finally {
    restoreFetch();
    Deno.env.delete("FEEDBACK_WEBHOOK");
  }
});

Deno.test("feedback-modal: missing fields default to fallbacks", async () => {
  // Without feedbackWebhook set, it skips the send and goes straight to success
  Deno.env.delete("FEEDBACK_WEBHOOK");
  try {
    const result = await handler.execute({
      fields: {},
      userId: "u1",
    } as any);
    assertEquals(result.success, true);
    assertEquals(result.embed!.fields![0].value, "No topic");
    assertEquals(result.embed!.fields![1].value, "No details");
  } finally {
    // cleanup
  }
});
