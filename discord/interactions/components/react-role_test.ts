import "../../../test/_mocks/env.ts";
import "../../../test/_mocks/sqlite.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { kv } from "../../persistence/kv.ts";
import { mockFetch, getCalls, restoreFetch } from "../../../test/_mocks/fetch.ts";
import reactRole from "./react-role.ts";

function resetStore() {
  (sqlite as any)._reset();
}

function makeCtx(
  guildId = "g1",
  userId = "u1",
  roleId = "role1",
  memberRoles: string[] = [],
) {
  return {
    customId: `react-role:${roleId}`,
    guildId,
    userId,
    interaction: { member: { roles: memberRoles } },
  };
}

Deno.test("react-role: returns error when no roleId in customId", async () => {
  resetStore();
  const result = await reactRole.execute({
    customId: "react-role:",
    guildId: "g1",
    userId: "u1",
    interaction: { member: { roles: [] } },
  });
  assertEquals(result.success, false);
  assert(result.error!.includes("Invalid"));
});

Deno.test("react-role: returns error when config not found", async () => {
  resetStore();
  const result = await reactRole.execute(makeCtx());
  assertEquals(result.success, false);
  assert(result.error!.includes("no longer available"));
});

Deno.test("react-role: returns error when role not in config", async () => {
  resetStore();
  await kv.set("react-roles:g1", { roles: [{ roleId: "other_role" }] });
  const result = await reactRole.execute(makeCtx("g1", "u1", "role1"));
  assertEquals(result.success, false);
  assert(result.error!.includes("no longer available"));
});

Deno.test("react-role: adds role when user doesn't have it", async () => {
  resetStore();
  await kv.set("react-roles:g1", { roles: [{ roleId: "role1" }] });
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const result = await reactRole.execute(makeCtx("g1", "u1", "role1", []));
    assertEquals(result.success, true);
    assert(result.message!.includes("Added"));

    const calls = getCalls();
    // discordBotFetch makes the request to Discord API
    assert(calls.length >= 1);
    const apiCall = calls.find((c) => c.url.includes("discord.com"));
    assert(apiCall !== undefined);
    assertEquals(apiCall!.init?.method, "PUT");
    assert(apiCall!.url.includes("roles/role1"));
  } finally {
    restoreFetch();
  }
});

Deno.test("react-role: removes role when user already has it", async () => {
  resetStore();
  await kv.set("react-roles:g1", { roles: [{ roleId: "role1" }] });
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const result = await reactRole.execute(makeCtx("g1", "u1", "role1", ["role1"]));
    assertEquals(result.success, true);
    assert(result.message!.includes("Removed"));

    const calls = getCalls();
    const apiCall = calls.find((c) => c.url.includes("discord.com"));
    assert(apiCall !== undefined);
    assertEquals(apiCall!.init?.method, "DELETE");
  } finally {
    restoreFetch();
  }
});

Deno.test("react-role: handles API failure", async () => {
  resetStore();
  await kv.set("react-roles:g1", { roles: [{ roleId: "role1" }] });
  mockFetch({ default: { status: 403, body: "Missing Permissions" } });
  try {
    const result = await reactRole.execute(makeCtx("g1", "u1", "role1", []));
    assertEquals(result.success, false);
    assert(result.error!.includes("permissions") || result.error!.includes("Failed"));
  } finally {
    restoreFetch();
  }
});

Deno.test("react-role: component metadata is correct", () => {
  assertEquals(reactRole.customId, "react-role:");
  assertEquals(reactRole.match, "prefix");
  assertEquals(reactRole.type, "button");
});
