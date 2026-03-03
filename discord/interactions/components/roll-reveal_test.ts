import "../../../test/_mocks/env.ts";
import { assertEquals, assert, assertStringIncludes } from "@std/assert";
import { mockFetch, getCalls, restoreFetch } from "../../../test/_mocks/fetch.ts";
import rollReveal from "./roll-reveal.ts";

function makeCtx(userId: string, rollerId: string, content: string, channelId = "ch1") {
  return {
    customId: `roll-reveal:${rollerId}`,
    guildId: "g1",
    userId,
    interaction: {
      channel_id: channelId,
      message: { content },
    },
  };
}

const SECRET_PREFIX = "\u{1F510} **Secret Roll**\n";
const ROLL_MESSAGE = "\u{1F3B2} **1d20**\nResult: **15**";
const SECRET_MESSAGE = `${SECRET_PREFIX}${ROLL_MESSAGE}`;

// --- metadata ---

Deno.test("roll-reveal: component metadata is correct", () => {
  assertEquals(rollReveal.customId, "roll-reveal:");
  assertEquals(rollReveal.match, "prefix");
  assertEquals(rollReveal.type, "button");
});

// --- authorization ---

Deno.test("roll-reveal: rejects non-roller", async () => {
  const result = await rollReveal.execute(makeCtx("other-user", "u1", SECRET_MESSAGE));
  assertEquals(result.success, false);
  assertStringIncludes(result.error!, "Only the roller");
});

// --- successful reveal ---

Deno.test("roll-reveal: roller can reveal and posts publicly", async () => {
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const result = await rollReveal.execute(makeCtx("u1", "u1", SECRET_MESSAGE));
    assertEquals(result.success, true);
    assertEquals(result.updateMessage, true);

    // Should post the clean roll message (no secret prefix)
    const calls = getCalls();
    const postCall = calls.find((c) => c.url.includes("channels/ch1/messages"));
    assert(postCall !== undefined, "Expected public post");
    const body = JSON.parse(postCall!.init!.body as string);
    assertEquals(body.content, ROLL_MESSAGE);
    assert(!body.content.includes("Secret Roll"));

    // Updated message should also strip the prefix
    assertEquals(result.message, ROLL_MESSAGE);
  } finally {
    restoreFetch();
  }
});

Deno.test("roll-reveal: strips secret prefix from message", async () => {
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const result = await rollReveal.execute(makeCtx("u1", "u1", SECRET_MESSAGE));
    assertEquals(result.message, ROLL_MESSAGE);
    assert(!result.message!.includes("Secret Roll"));
  } finally {
    restoreFetch();
  }
});

Deno.test("roll-reveal: handles message without secret prefix gracefully", async () => {
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const result = await rollReveal.execute(makeCtx("u1", "u1", ROLL_MESSAGE));
    assertEquals(result.success, true);
    assertEquals(result.message, ROLL_MESSAGE);

    const calls = getCalls();
    const postCall = calls.find((c) => c.url.includes("channels/ch1/messages"));
    const body = JSON.parse(postCall!.init!.body as string);
    assertEquals(body.content, ROLL_MESSAGE);
  } finally {
    restoreFetch();
  }
});

// --- button removal ---

Deno.test("roll-reveal: response has no components (button removed)", async () => {
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const result = await rollReveal.execute(makeCtx("u1", "u1", SECRET_MESSAGE));
    assertEquals(result.components, undefined);
  } finally {
    restoreFetch();
  }
});

// --- channel fallback ---

Deno.test("roll-reveal: uses channel.id fallback when channel_id missing", async () => {
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const ctx = {
      customId: "roll-reveal:u1",
      guildId: "g1",
      userId: "u1",
      interaction: {
        channel: { id: "ch2" },
        message: { content: SECRET_MESSAGE },
      },
    };
    const result = await rollReveal.execute(ctx);
    assertEquals(result.success, true);

    const calls = getCalls();
    const postCall = calls.find((c) => c.url.includes("channels/ch2/messages"));
    assert(postCall !== undefined, "Expected post to channel.id fallback");
  } finally {
    restoreFetch();
  }
});
