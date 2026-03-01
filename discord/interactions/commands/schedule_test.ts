import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "@std/assert";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { kv } from "../../persistence/kv.ts";
import type { ScheduledMessage } from "./schedule.ts";
import { KV_PREFIX } from "./schedule.ts";

function resetStore() {
  (sqlite as any)._reset();
}

const ADMIN_PERMISSIONS = "8"; // ADMINISTRATOR bit

Deno.test("schedule send: invalid time returns error", async () => {
  resetStore();
  const mod = (await import("./schedule.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "send", channel: "c1", time: "nope", message: "hi" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("Invalid time"));
});

Deno.test("schedule send: creates entry", async () => {
  resetStore();
  const mod = (await import("./schedule.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "send", channel: "c1", time: "1h", message: "hello world" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);

  const entries = await kv.list(`${KV_PREFIX}g1:`);
  assertEquals(entries.length, 1);
  const msg = entries[0].value as ScheduledMessage;
  assertEquals(msg.content, "hello world");
  assertEquals(msg.channelId, "c1");
});

Deno.test("schedule list: shows entries", async () => {
  resetStore();
  const prefix = `${KV_PREFIX}g1:`;
  await kv.set(`${prefix}1234`, {
    guildId: "g1",
    channelId: "c1",
    content: "test msg",
    sendAt: Date.now() + 3600000,
    createdBy: "u1",
    createdAt: Date.now(),
  }, Date.now() + 3600000);

  const mod = (await import("./schedule.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "list" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);
  assert(result.message?.includes("test msg"));
});

Deno.test("schedule cancel: removes entry", async () => {
  resetStore();
  const key = `${KV_PREFIX}g1:12345`;
  await kv.set(key, {
    guildId: "g1",
    channelId: "c1",
    content: "to cancel",
    sendAt: Date.now() + 3600000,
    createdBy: "u1",
    createdAt: Date.now(),
  });

  const mod = (await import("./schedule.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "cancel", id: key },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);
  assert(result.message?.includes("cancelled"));

  const gone = await kv.get(key);
  assertEquals(gone, null);
});

Deno.test("schedule send: 25-per-guild limit enforced", async () => {
  resetStore();
  const prefix = `${KV_PREFIX}g1:`;
  for (let i = 0; i < 25; i++) {
    await kv.set(`${prefix}${i}`, {
      guildId: "g1",
      channelId: "c1",
      content: `msg${i}`,
      sendAt: Date.now() + 3600000,
      createdBy: "u1",
      createdAt: Date.now(),
    });
  }

  const mod = (await import("./schedule.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "send", channel: "c1", time: "1h", message: "overflow" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("Maximum 25"));
});
