import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "@std/assert";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { kv } from "../../persistence/kv.ts";
import type { Reminder } from "./remind.ts";

function resetStore() {
  (sqlite as any)._reset();
}

Deno.test("remind: invalid duration returns error", async () => {
  resetStore();
  const mod = (await import("./remind.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { duration: "invalid", message: "test", channelId: "c1" },
    memberRoles: [],
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("Invalid duration"));
});

Deno.test("remind: valid duration creates KV entry", async () => {
  resetStore();
  const mod = (await import("./remind.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { duration: "1h", message: "test reminder", channelId: "c1" },
    memberRoles: [],
  } as any);
  assertEquals(result.success, true);

  const entries = await kv.list("reminder:u1:");
  assertEquals(entries.length, 1);
  const reminder = entries[0].value as Reminder;
  assertEquals(reminder.message, "test reminder");
  assertEquals(reminder.userId, "u1");
  assertEquals(reminder.channelId, "c1");
});

Deno.test("remind: max 10 limit enforced", async () => {
  resetStore();
  // Pre-populate 10 reminders
  for (let i = 0; i < 10; i++) {
    await kv.set(`reminder:u1:g1:${i}`, {
      userId: "u1",
      guildId: "g1",
      channelId: "c1",
      message: `r${i}`,
      dueAt: Date.now() + 3600000,
      createdAt: Date.now(),
    });
  }

  const mod = (await import("./remind.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { duration: "1h", message: "overflow", channelId: "c1" },
    memberRoles: [],
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("at most 10"));
});
