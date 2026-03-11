import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import userInfoCommand from "./user-info.ts";

Deno.test("user-info: no targetId returns error", async () => {
  const result = await userInfoCommand.execute({
    guildId: "g1",
    userId: "u1",
    options: {},
    targetId: undefined,
    resolved: undefined,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("No user"));
});

Deno.test("user-info: valid user returns embed with fields", async () => {
  const result = await userInfoCommand.execute({
    guildId: "g1",
    userId: "u1",
    options: {},
    targetId: "123456789012345678",
    resolved: {
      users: {
        "123456789012345678": {
          username: "testuser",
          global_name: "Test User",
          avatar: "abc123",
        },
      },
      members: {},
    },
  } as any);
  assertEquals(result.success, true);
  assert(result.embed);
  assertEquals(result.embed.title, "Test User");
  const usernameField = result.embed.fields.find((f: any) => f.name === "Username");
  assertEquals(usernameField?.value, "testuser");
  const idField = result.embed.fields.find((f: any) => f.name === "ID");
  assertEquals(idField?.value, "123456789012345678");
});

Deno.test("user-info: avatar URL constructed when present", async () => {
  const result = await userInfoCommand.execute({
    guildId: "g1",
    userId: "u1",
    options: {},
    targetId: "123456789012345678",
    resolved: {
      users: {
        "123456789012345678": {
          username: "testuser",
          global_name: "Test",
          avatar: "abc123",
        },
      },
      members: {},
    },
  } as any);
  assert(result.embed.thumbnail?.url.includes("abc123"));
  assert(result.embed.thumbnail?.url.includes("123456789012345678"));
});

Deno.test("user-info: missing avatar omits thumbnail", async () => {
  const result = await userInfoCommand.execute({
    guildId: "g1",
    userId: "u1",
    options: {},
    targetId: "123456789012345678",
    resolved: {
      users: {
        "123456789012345678": {
          username: "noavatar",
          global_name: "No Avatar",
          avatar: null,
        },
      },
      members: {},
    },
  } as any);
  assertEquals(result.embed.thumbnail, undefined);
});

Deno.test("user-info: snowflakeToDate creates valid date field", async () => {
  // Discord snowflake 123456789012345678 corresponds to a date
  const result = await userInfoCommand.execute({
    guildId: "g1",
    userId: "u1",
    options: {},
    targetId: "123456789012345678",
    resolved: {
      users: {
        "123456789012345678": { username: "test", global_name: "Test" },
      },
      members: {},
    },
  } as any);
  const createdField = result.embed.fields.find((f: any) => f.name === "Created");
  assert(createdField !== undefined);
  assert(createdField.value.includes("<t:"));
});
