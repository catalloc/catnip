import "../../../test/_mocks/env.ts";
import { assertEquals, assert, assertStringIncludes } from "@std/assert";
import { mockFetch, getCalls, restoreFetch } from "../../../test/_mocks/fetch.ts";
import r from "./r.ts";

function makeOptions(dice: string, secret?: boolean, announce?: boolean) {
  const opts: Record<string, any> = { dice, channelId: "ch1" };
  if (secret !== undefined) opts.secret = secret;
  if (announce !== undefined) opts.announce = announce;
  return opts;
}

function exec(dice: string, secret?: boolean, announce?: boolean) {
  return r.execute({
    guildId: "g1",
    userId: "u1",
    options: makeOptions(dice, secret, announce),
    config: {},
  });
}

// --- metadata ---

Deno.test("r: command metadata is correct", () => {
  assertEquals(r.name, "r");
  assertEquals(r.deferred, false);
  assertEquals(r.ephemeral, false);
  assertEquals(r.options!.length, 3);
  assertEquals(r.options![2].name, "announce");
});

// --- validation ---

Deno.test("r: invalid notation returns error", async () => {
  const result = await exec("banana");
  assertEquals(result.success, false);
  assertStringIncludes(result.error!, "Invalid dice notation");
});

Deno.test("r: too many dice returns error", async () => {
  const result = await exec("21d6");
  assertEquals(result.success, false);
  assertStringIncludes(result.error!, "Dice count");
});

Deno.test("r: sides out of range returns error", async () => {
  const result = await exec("1d1");
  assertEquals(result.success, false);
  assertStringIncludes(result.error!, "Die size");
});

// --- public rolls ---

Deno.test("r: public roll returns ephemeral false and no components", async () => {
  const result = await exec("1d20");
  assertEquals(result.success, true);
  assertEquals(result.ephemeral, false);
  assertEquals(result.components, undefined);
  assertStringIncludes(result.message!, "**1d20**");
  assert(!result.message!.includes("Secret Roll"));
});

Deno.test("r: public roll with modifier shows total breakdown", async () => {
  const result = await exec("2d6+3");
  assertEquals(result.success, true);
  assertStringIncludes(result.message!, "**2d6+3**");
  assertStringIncludes(result.message!, "Rolls:");
  assertStringIncludes(result.message!, "Total:");
});

// --- secret rolls ---

Deno.test("r: secret roll is ephemeral with secret prefix", async () => {
  const result = await exec("1d20", true);
  assertEquals(result.success, true);
  assertEquals(result.ephemeral, true);
  assertStringIncludes(result.message!, "\u{1F510} **Secret Roll**");
  assertStringIncludes(result.message!, "**1d20**");
});

Deno.test("r: secret roll includes Reveal button", async () => {
  const result = await exec("1d20", true);
  assert(result.components !== undefined);
  assertEquals(result.components!.length, 1);
  const actionRow = result.components![0];
  assertEquals(actionRow.type, 1);
  const button = actionRow.components[0];
  assertEquals(button.type, 2);
  assertEquals(button.style, 1);
  assertEquals(button.label, "Reveal Roll");
  assertEquals(button.custom_id, "roll-reveal:u1");
});

// --- secret + announce ---

Deno.test("r: secret + announce sends public channel message", async () => {
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const result = await exec("1d20", true, true);
    assertEquals(result.success, true);
    assertEquals(result.ephemeral, true);

    // Wait a tick for the fire-and-forget fetch to be recorded
    await new Promise((r) => setTimeout(r, 50));

    const calls = getCalls();
    const announceCall = calls.find((c) => c.url.includes("channels/ch1/messages"));
    assert(announceCall !== undefined, "Expected announce fetch call");
    const body = JSON.parse(announceCall!.init!.body as string);
    assertStringIncludes(body.content, "<@u1> rolled some dice...");
  } finally {
    restoreFetch();
  }
});

Deno.test("r: secret without announce does not send channel message", async () => {
  mockFetch({ default: { status: 200, body: {} } });
  try {
    await exec("1d20", true, false);
    await new Promise((r) => setTimeout(r, 50));
    const calls = getCalls();
    const announceCall = calls.find((c) => c.url.includes("channels/ch1/messages"));
    assertEquals(announceCall, undefined);
  } finally {
    restoreFetch();
  }
});

// --- announce without secret is a no-op ---

Deno.test("r: announce without secret has no effect", async () => {
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const result = await exec("1d20", false, true);
    assertEquals(result.ephemeral, false);
    assertEquals(result.components, undefined);
    await new Promise((r) => setTimeout(r, 50));
    const calls = getCalls();
    assertEquals(calls.length, 0);
  } finally {
    restoreFetch();
  }
});
