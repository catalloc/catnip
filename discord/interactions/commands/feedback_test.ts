import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import command from "./feedback.ts";

Deno.test("feedback: without feedbackWebhook returns not configured", async () => {
  const orig = Deno.env.get("FEEDBACK_WEBHOOK");
  Deno.env.delete("FEEDBACK_WEBHOOK");
  try {
    const result = await command.execute({} as any);
    assertEquals(result.success, true);
    assert(result.embed);
    assertEquals(result.embed!.title, "Feedback Not Enabled");
  } finally {
    if (orig) Deno.env.set("FEEDBACK_WEBHOOK", orig);
  }
});

Deno.test("feedback: with webhook returns modal", async () => {
  Deno.env.set("FEEDBACK_WEBHOOK", "https://discord.com/api/webhooks/test/test");
  try {
    const result = await command.execute({} as any);
    assertEquals(result.success, true);
    assert(result.modal);
    assertEquals(result.modal!.custom_id, "feedback-modal");
    assertEquals(result.modal!.title, "Submit Feedback");
  } finally {
    Deno.env.delete("FEEDBACK_WEBHOOK");
  }
});

Deno.test("feedback: modal has topic and details fields", async () => {
  Deno.env.set("FEEDBACK_WEBHOOK", "https://discord.com/api/webhooks/test/test");
  try {
    const result = await command.execute({} as any);
    const components = result.modal!.components;
    assertEquals(components.length, 2);
    assertEquals(components[0].components[0].custom_id, "feedback_topic");
    assertEquals(components[1].components[0].custom_id, "feedback_details");
  } finally {
    Deno.env.delete("FEEDBACK_WEBHOOK");
  }
});
