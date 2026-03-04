import "../../../test/_mocks/env.ts";
import "../../../test/_mocks/sqlite.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { mockFetch, restoreFetch } from "../../../test/_mocks/fetch.ts";
import { guildConfig } from "../../persistence/guild-config.ts";
import serverCmd from "./server.ts";

function resetStore() {
  (sqlite as any)._reset();
}

const GUILD = "test_guild_server";

function makeOpts(subcommand: string, opts: Record<string, unknown> = {}) {
  return { guildId: GUILD, options: { subcommand, ...opts } };
}

// --- admin:add ---

Deno.test("server admin:add: adds admin role", async () => {
  resetStore();
  const result = await serverCmd.execute(makeOpts("admin:add", { role: "role1" }));
  assertEquals(result.success, true);
  assert(result.message!.includes("role1"));

  const roles = await guildConfig.getAdminRoleIds(GUILD);
  assertEquals(roles.includes("role1"), true);
});

Deno.test("server admin:add: rejects duplicate role", async () => {
  resetStore();
  await guildConfig.addAdminRole(GUILD, "role1");
  const result = await serverCmd.execute(makeOpts("admin:add", { role: "role1" }));
  assertEquals(result.success, false);
  assert(result.error!.includes("already"));
});

// --- admin:remove ---

Deno.test("server admin:remove: removes existing role", async () => {
  resetStore();
  await guildConfig.addAdminRole(GUILD, "role2");
  const result = await serverCmd.execute(makeOpts("admin:remove", { role: "role2" }));
  assertEquals(result.success, true);
  assert(result.message!.includes("Removed"));
});

Deno.test("server admin:remove: fails for non-existent role", async () => {
  resetStore();
  const result = await serverCmd.execute(makeOpts("admin:remove", { role: "nonexistent" }));
  assertEquals(result.success, false);
  assert(result.error!.includes("not an admin"));
});

// --- admin:list ---

Deno.test("server admin:list: shows message when no roles", async () => {
  resetStore();
  const result = await serverCmd.execute(makeOpts("admin:list"));
  assertEquals(result.success, true);
  assert(result.message!.includes("No admin roles"));
});

Deno.test("server admin:list: shows configured roles", async () => {
  resetStore();
  await guildConfig.addAdminRole(GUILD, "role_a");
  await guildConfig.addAdminRole(GUILD, "role_b");
  const result = await serverCmd.execute(makeOpts("admin:list"));
  assertEquals(result.success, true);
  assert(result.embed!.description!.includes("role_a"));
  assert(result.embed!.description!.includes("role_b"));
});

// --- commands:enable ---

Deno.test("server commands:enable: rejects unknown command", async () => {
  resetStore();
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const result = await serverCmd.execute(makeOpts("commands:enable", { command: "totally_fake_command" }));
    assertEquals(result.success, false);
    assert(result.error!.includes("Unknown"));
  } finally {
    restoreFetch();
  }
});

// --- commands:disable ---

Deno.test("server commands:disable: fails for non-enabled command", async () => {
  resetStore();
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const result = await serverCmd.execute(makeOpts("commands:disable", { command: "not_enabled" }));
    assertEquals(result.success, false);
    assert(result.error!.includes("not enabled"));
  } finally {
    restoreFetch();
  }
});

// --- commands:list ---

Deno.test("server commands:list: returns embed with command status", async () => {
  resetStore();
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const result = await serverCmd.execute(makeOpts("commands:list"));
    assertEquals(result.success, true);
    assert(result.embed !== undefined);
    assertEquals(result.embed!.title, "Guild Commands");
  } finally {
    restoreFetch();
  }
});

// --- info ---

Deno.test("server info: shows config summary for unconfigured guild", async () => {
  resetStore();
  const result = await serverCmd.execute(makeOpts("info"));
  assertEquals(result.success, true);
  assert(result.embed!.title === "Server Configuration");
  assert(result.embed!.fields!.length === 2);
});

Deno.test("server info: shows config with roles and commands", async () => {
  resetStore();
  await guildConfig.addAdminRole(GUILD, "admin_role");
  await guildConfig.enableCommand(GUILD, "tag");
  const result = await serverCmd.execute(makeOpts("info"));
  assertEquals(result.success, true);
  const fields = result.embed!.fields!;
  assert(fields[0].value.includes("admin_role"));
  assert(fields[1].value.includes("tag"));
});

// --- unknown subcommand ---

Deno.test("server: returns error for missing subcommand", async () => {
  resetStore();
  const result = await serverCmd.execute({
    guildId: GUILD,
    options: { subcommand: undefined },
  });
  assertEquals(result.success, false);
  assert(result.error!.includes("subcommand"));
});

// --- command metadata ---

Deno.test("server: command metadata is correct", () => {
  assertEquals(serverCmd.name, "server");
  assertEquals(serverCmd.registration.type, "global");
  assertEquals(serverCmd.adminOnly, true);
});
