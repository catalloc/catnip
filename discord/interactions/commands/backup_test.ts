import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { blob } from "../../../test/_mocks/blob.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { kv } from "../../persistence/kv.ts";
import { _internals } from "./backup.ts";
import { InteractionResponseType } from "../patterns.ts";

function resetStore() {
  (blob as any)._reset();
  (sqlite as any)._reset();
}

const ADMIN_PERMISSIONS = "8";

function autocompleteBody(guildId: string, query: string) {
  return {
    guild_id: guildId,
    data: {
      options: [{
        options: [{ name: "id", value: query, focused: true }],
      }],
    },
  };
}

Deno.test("backup _internals.blobKey: correct format", () => {
  assertEquals(_internals.blobKey("g1", "abc"), "backup:g1:abc");
});

Deno.test("backup _internals.blobPrefix: correct format", () => {
  assertEquals(_internals.blobPrefix("g1"), "backup:g1:");
});

Deno.test("backup _internals.sanitizeName: cleans names", () => {
  assertEquals(_internals.sanitizeName("Hello World!"), "helloworld");
  assertEquals(_internals.sanitizeName("my-template"), "my-template");
  assertEquals(_internals.sanitizeName("../../../etc"), "etc");
  assertEquals(_internals.sanitizeName(""), "");
});

Deno.test("backup _internals.isValidBackupData: accepts valid data", () => {
  assertEquals(_internals.isValidBackupData({
    version: 1,
    guildId: "g1",
    createdBy: "u1",
    createdAt: "2024-01-01",
    data: {},
  }), true);
});

Deno.test("backup _internals.isValidBackupData: accepts data with tags", () => {
  assertEquals(_internals.isValidBackupData({
    version: 1,
    guildId: "g1",
    createdBy: "u1",
    createdAt: "2024-01-01",
    data: {
      tags: { hello: { content: "world", createdBy: "u1", createdAt: "2024-01-01" } },
    },
  }), true);
});

Deno.test("backup _internals.isValidBackupData: rejects wrong version", () => {
  assertEquals(_internals.isValidBackupData({
    version: 2,
    guildId: "g1",
    createdBy: "u1",
    createdAt: "2024-01-01",
    data: {},
  }), false);
});

Deno.test("backup _internals.isValidBackupData: rejects missing guildId", () => {
  assertEquals(_internals.isValidBackupData({
    version: 1,
    createdBy: "u1",
    createdAt: "2024-01-01",
    data: {},
  }), false);
});

Deno.test("backup _internals.isValidBackupData: rejects missing data object", () => {
  assertEquals(_internals.isValidBackupData({
    version: 1,
    guildId: "g1",
    createdBy: "u1",
    createdAt: "2024-01-01",
  }), false);
});

Deno.test("backup _internals.isValidBackupData: rejects invalid tag shape", () => {
  assertEquals(_internals.isValidBackupData({
    version: 1,
    guildId: "g1",
    createdBy: "u1",
    createdAt: "2024-01-01",
    data: {
      tags: { hello: { content: 123 } },
    },
  }), false);
});

Deno.test("backup _internals.isValidBackupData: rejects invalid template shape", () => {
  assertEquals(_internals.isValidBackupData({
    version: 1,
    guildId: "g1",
    createdBy: "u1",
    createdAt: "2024-01-01",
    data: {
      templates: { test: { title: 123 } },
    },
  }), false);
});

Deno.test("backup _internals.isValidBackupData: rejects non-number counter", () => {
  assertEquals(_internals.isValidBackupData({
    version: 1,
    guildId: "g1",
    createdBy: "u1",
    createdAt: "2024-01-01",
    data: { counter: "not a number" },
  }), false);
});

Deno.test("backup _internals.isValidBackupData: rejects null", () => {
  assertEquals(_internals.isValidBackupData(null), false);
});

Deno.test("backup _internals.isValidBackupData: rejects string", () => {
  assertEquals(_internals.isValidBackupData("not an object"), false);
});

Deno.test("backup export: creates a backup with tags", async () => {
  resetStore();
  await kv.set("tags:g1", {
    hello: { content: "world", createdBy: "u1", createdAt: "2024-01-01" },
    foo: { content: "bar", createdBy: "u1", createdAt: "2024-01-01" },
  });

  const mod = (await import("./backup.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "export" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("2 tags"));

  const items = await blob.list("backup:g1:");
  assertEquals(items.length, 1);
});

Deno.test("backup export: creates a backup with templates", async () => {
  resetStore();
  await blob.setJSON("template:g1:welcome", {
    title: "Welcome",
    description: "Hello!",
    createdBy: "u1",
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
  });

  const mod = (await import("./backup.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "export" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("1 templates"));
});

Deno.test("backup export: enforces max backups", async () => {
  resetStore();
  for (let i = 0; i < 5; i++) {
    await blob.setJSON(`backup:g1:id${i}`, {
      version: 1,
      guildId: "g1",
      createdBy: "u1",
      createdAt: "2024-01-01",
      data: {},
    });
  }

  const mod = (await import("./backup.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "export" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("Maximum"));
});

Deno.test("backup import: restores tags and counter", async () => {
  resetStore();
  const tags = {
    hello: { content: "world", createdBy: "u1", createdAt: "2024-01-01" },
  };
  await blob.setJSON("backup:g1:backup1", {
    version: 1,
    guildId: "g1",
    createdBy: "u1",
    createdAt: "2024-01-01",
    data: { tags, counter: 42 },
  });

  const mod = (await import("./backup.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "import", id: "backup1" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("1 tags"));
  assert(result.embed?.description?.includes("counter"));

  const restoredTags = await kv.get<Record<string, any>>("tags:g1");
  assertEquals(restoredTags?.hello?.content, "world");
  const counter = await kv.get<number>("counter:g1");
  assertEquals(counter, 42);
});

Deno.test("backup import: restores templates", async () => {
  resetStore();
  const templates = {
    welcome: {
      title: "Welcome",
      description: "Hello!",
      createdBy: "u1",
      createdAt: "2024-01-01",
      updatedAt: "2024-01-01",
    },
  };
  await blob.setJSON("backup:g1:backup1", {
    version: 1,
    guildId: "g1",
    createdBy: "u1",
    createdAt: "2024-01-01",
    data: { templates },
  });

  const mod = (await import("./backup.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "import", id: "backup1" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);

  const template = await blob.getJSON<any>("template:g1:welcome");
  assertEquals(template?.title, "Welcome");
});

Deno.test("backup import: not found", async () => {
  resetStore();
  const mod = (await import("./backup.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "import", id: "nope" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("not found"));
});

Deno.test("backup import: wrong guild rejected", async () => {
  resetStore();
  await blob.setJSON("backup:g1:backup1", {
    version: 1,
    guildId: "g2",
    createdBy: "u1",
    createdAt: "2024-01-01",
    data: {},
  });

  const mod = (await import("./backup.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "import", id: "backup1" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("different guild"));
});

Deno.test("backup list: shows backups", async () => {
  resetStore();
  await blob.setJSON("backup:g1:id1", {
    version: 1,
    guildId: "g1",
    createdBy: "u1",
    createdAt: "2024-06-15T10:00:00.000Z",
    data: { tags: { hello: { content: "world", createdBy: "u1", createdAt: "2024-01-01" } } },
  });

  const mod = (await import("./backup.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "list" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("id1"));
  assert(result.embed?.description?.includes("1 tags"));
});

Deno.test("backup list: empty", async () => {
  resetStore();
  const mod = (await import("./backup.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "list" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);
  assert(result.message?.includes("No backups"));
});

Deno.test("backup delete: removes backup", async () => {
  resetStore();
  await blob.setJSON("backup:g1:id1", {
    version: 1,
    guildId: "g1",
    createdBy: "u1",
    createdAt: "2024-01-01",
    data: {},
  });

  const mod = (await import("./backup.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "delete", id: "id1" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);
  assert(result.message?.includes("deleted"));

  const entry = await blob.getJSON("backup:g1:id1");
  assertEquals(entry, undefined);
});

Deno.test("backup delete: not found", async () => {
  resetStore();
  const mod = (await import("./backup.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "delete", id: "nope" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("not found"));
});

Deno.test("backup export: creates backup with all data types", async () => {
  resetStore();
  await kv.set("tags:g1", {
    hello: { content: "world", createdBy: "u1", createdAt: "2024-01-01" },
  });
  await blob.setJSON("template:g1:welcome", {
    title: "Welcome",
    description: "Hello!",
    createdBy: "u1",
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
  });
  await kv.set("counter:g1", 42);

  const mod = (await import("./backup.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "export" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("1 tags"));
  assert(result.embed?.description?.includes("1 templates"));
  assert(result.embed?.description?.includes("counter"));
});

Deno.test("backup export: empty data shows no data", async () => {
  resetStore();
  const mod = (await import("./backup.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "export" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("no data"));
});

Deno.test("backup import: empty data object succeeds", async () => {
  resetStore();
  await blob.setJSON("backup:g1:empty1", {
    version: 1,
    guildId: "g1",
    createdBy: "u1",
    createdAt: "2024-01-01",
    data: {},
  });

  const mod = (await import("./backup.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "import", id: "empty1" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("no data"));
});

Deno.test("backup list: shows mixed data types per backup", async () => {
  resetStore();
  await blob.setJSON("backup:g1:id1", {
    version: 1,
    guildId: "g1",
    createdBy: "u1",
    createdAt: "2024-06-15T10:00:00.000Z",
    data: {
      tags: { hello: { content: "world", createdBy: "u1", createdAt: "2024-01-01" } },
      templates: { welcome: { title: "W", description: "D", createdBy: "u1", createdAt: "2024-01-01", updatedAt: "2024-01-01" } },
      counter: 5,
    },
  });

  const mod = (await import("./backup.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "list" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("1 tags"));
  assert(result.embed?.description?.includes("1 templates"));
  assert(result.embed?.description?.includes("counter"));
});

Deno.test("backup: invalid subcommand returns error", async () => {
  resetStore();
  const mod = (await import("./backup.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "invalid" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("subcommand"));
});

Deno.test("backup autocomplete: returns all backups with empty query", async () => {
  resetStore();
  await blob.setJSON("backup:ac-g1:id1", {
    version: 1,
    guildId: "ac-g1",
    createdBy: "u1",
    createdAt: "2024-01-01T00:00:00.000Z",
    data: {},
  });
  await blob.setJSON("backup:ac-g1:id2", {
    version: 1,
    guildId: "ac-g1",
    createdBy: "u1",
    createdAt: "2024-01-02T00:00:00.000Z",
    data: {},
  });
  const mod = (await import("./backup.ts")).default;
  const resp = await mod.autocomplete!(autocompleteBody("ac-g1", ""), {});
  const data = await resp.json();
  assertEquals(data.type, InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT);
  assertEquals(data.data.choices.length, 2);
});

Deno.test("backup autocomplete: filters by query", async () => {
  resetStore();
  await blob.setJSON("backup:ac-g2:abc", {
    version: 1,
    guildId: "ac-g2",
    createdBy: "u1",
    createdAt: "2024-01-01T00:00:00.000Z",
    data: {},
  });
  await blob.setJSON("backup:ac-g2:xyz", {
    version: 1,
    guildId: "ac-g2",
    createdBy: "u1",
    createdAt: "2024-01-02T00:00:00.000Z",
    data: {},
  });
  const mod = (await import("./backup.ts")).default;
  const resp = await mod.autocomplete!(autocompleteBody("ac-g2", "abc"), {});
  const data = await resp.json();
  assertEquals(data.data.choices.length, 1);
  assertEquals(data.data.choices[0].value, "abc");
});

Deno.test("backup autocomplete: scoped to guild", async () => {
  resetStore();
  await blob.setJSON("backup:ac-g3:mine", {
    version: 1,
    guildId: "ac-g3",
    createdBy: "u1",
    createdAt: "2024-01-01T00:00:00.000Z",
    data: {},
  });
  await blob.setJSON("backup:ac-g4:theirs", {
    version: 1,
    guildId: "ac-g4",
    createdBy: "u1",
    createdAt: "2024-01-01T00:00:00.000Z",
    data: {},
  });
  const mod = (await import("./backup.ts")).default;
  const resp = await mod.autocomplete!(autocompleteBody("ac-g3", ""), {});
  const data = await resp.json();
  assertEquals(data.data.choices.length, 1);
  assertEquals(data.data.choices[0].value, "mine");
});

Deno.test("backup import: rejects invalid data shape", async () => {
  resetStore();
  // Store raw invalid data (wrong version)
  await blob.setJSON("backup:g1:bad1", {
    version: 2,
    guildId: "g1",
    createdBy: "u1",
    createdAt: "2024-01-01",
    data: {},
  });

  const mod = (await import("./backup.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "import", id: "bad1" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("corrupt"));
});

Deno.test("backup import: sanitizes template names", async () => {
  resetStore();
  await blob.setJSON("backup:g1:backup1", {
    version: 1,
    guildId: "g1",
    createdBy: "u1",
    createdAt: "2024-01-01",
    data: {
      templates: {
        "My Template!": {
          title: "Welcome",
          description: "Hello!",
          createdBy: "u1",
          createdAt: "2024-01-01",
          updatedAt: "2024-01-01",
        },
      },
    },
  });

  const mod = (await import("./backup.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "import", id: "backup1" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);

  // Name should be sanitized: "My Template!" → "mytemplate"
  const cleaned = await blob.getJSON<any>("template:g1:mytemplate");
  assertEquals(cleaned?.title, "Welcome");
  // Original unsanitized key should not exist
  const original = await blob.getJSON<any>("template:g1:My Template!");
  assertEquals(original, undefined);
});

Deno.test("backup import: skips templates with empty sanitized name", async () => {
  resetStore();
  await blob.setJSON("backup:g1:backup1", {
    version: 1,
    guildId: "g1",
    createdBy: "u1",
    createdAt: "2024-01-01",
    data: {
      templates: {
        "!!!": {
          title: "Bad Name",
          description: "All special chars",
          createdBy: "u1",
          createdAt: "2024-01-01",
          updatedAt: "2024-01-01",
        },
        "good": {
          title: "Good",
          description: "Valid name",
          createdBy: "u1",
          createdAt: "2024-01-01",
          updatedAt: "2024-01-01",
        },
      },
    },
  });

  const mod = (await import("./backup.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "import", id: "backup1" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);

  // "good" should exist, "!!!" should be silently dropped
  const good = await blob.getJSON<any>("template:g1:good");
  assertEquals(good?.title, "Good");
});

Deno.test("backup import: strips private-IP imageUrl from templates", async () => {
  resetStore();
  await blob.setJSON("backup:g1:backup1", {
    version: 1,
    guildId: "g1",
    createdBy: "u1",
    createdAt: "2024-01-01",
    data: {
      templates: {
        test: {
          title: "Test",
          description: "Has private IP image",
          imageUrl: "http://192.168.1.1/secret.png",
          createdBy: "u1",
          createdAt: "2024-01-01",
          updatedAt: "2024-01-01",
        },
      },
    },
  });

  const mod = (await import("./backup.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "import", id: "backup1" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);

  const template = await blob.getJSON<any>("template:g1:test");
  assertEquals(template?.title, "Test");
  assertEquals(template?.imageUrl, undefined); // private IP stripped
});

Deno.test("backup import: keeps valid public imageUrl in templates", async () => {
  resetStore();
  await blob.setJSON("backup:g1:backup1", {
    version: 1,
    guildId: "g1",
    createdBy: "u1",
    createdAt: "2024-01-01",
    data: {
      templates: {
        test: {
          title: "Test",
          description: "Has public image",
          imageUrl: "https://cdn.example.com/image.png",
          createdBy: "u1",
          createdAt: "2024-01-01",
          updatedAt: "2024-01-01",
        },
      },
    },
  });

  const mod = (await import("./backup.ts")).default;
  const result = await mod.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "import", id: "backup1" },
    memberRoles: [],
    memberPermissions: ADMIN_PERMISSIONS,
  } as any);
  assertEquals(result.success, true);

  const template = await blob.getJSON<any>("template:g1:test");
  assertEquals(template?.imageUrl, "https://cdn.example.com/image.png");
});
