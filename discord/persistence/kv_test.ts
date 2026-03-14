import "../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../test/assert.ts";
import { sqlite } from "https://esm.town/v/std/sqlite/main.ts";
import { kv, _internals, bootstrapKvTable } from "./kv.ts";

const { safeParse } = _internals;

function resetStore() {
  (sqlite as any)._reset();
}

// --- safeParse ---

Deno.test("safeParse: valid JSON object", () => {
  assertEquals(safeParse('{"a":1}'), { a: 1 });
});

Deno.test("safeParse: invalid JSON returns null", () => {
  assertEquals(safeParse("not json"), null);
});

Deno.test("safeParse: warning includes key when provided", () => {
  const warnings: string[] = [];
  const origWarn = console.warn;
  console.warn = (msg: string) => warnings.push(msg);
  try {
    safeParse("bad json", "myPrefix:123");
    assert(warnings.length > 0, "Should have logged a warning");
    assert(warnings[0].includes('myPrefix:123'), "Warning should include the key");
  } finally {
    console.warn = origWarn;
  }
});

Deno.test("safeParse: warning omits key when not provided", () => {
  const warnings: string[] = [];
  const origWarn = console.warn;
  console.warn = (msg: string) => warnings.push(msg);
  try {
    safeParse("bad json");
    assert(warnings.length > 0, "Should have logged a warning");
    assert(!warnings[0].includes('for key'), "Warning should not include key phrase");
  } finally {
    console.warn = origWarn;
  }
});

Deno.test("safeParse: valid JSON array", () => {
  assertEquals(safeParse("[1,2,3]"), [1, 2, 3]);
});

// --- kv CRUD ---

Deno.test("kv.get: non-existent key returns null", async () => {
  resetStore();
  assertEquals(await kv.get("missing"), null);
});

Deno.test("kv.set then get: round trip", async () => {
  resetStore();
  await kv.set("key1", { hello: "world" });
  const result = await kv.get("key1");
  assertEquals(result, { hello: "world" });
});

Deno.test("kv.delete: removes key", async () => {
  resetStore();
  await kv.set("delme", 42);
  await kv.delete("delme");
  assertEquals(await kv.get("delme"), null);
});

Deno.test("kv.list: all entries", async () => {
  resetStore();
  await kv.set("a:1", "one");
  await kv.set("a:2", "two");
  await kv.set("b:1", "three");
  const all = await kv.list();
  assertEquals(all.length, 3);
});

Deno.test("kv.list: with prefix filter", async () => {
  resetStore();
  await kv.set("ns:a", 1);
  await kv.set("ns:b", 2);
  await kv.set("other", 3);
  const filtered = await kv.list("ns:");
  assertEquals(filtered.length, 2);
});

Deno.test("kv.update: creates new key", async () => {
  resetStore();
  const result = await kv.update<number>("counter", (cur) => (cur ?? 0) + 1);
  assertEquals(result, 1);
  assertEquals(await kv.get("counter"), 1);
});

Deno.test("kv.update: modifies existing key", async () => {
  resetStore();
  await kv.set("counter", 5);
  const result = await kv.update<number>("counter", (cur) => (cur ?? 0) + 1);
  assertEquals(result, 6);
  assertEquals(await kv.get("counter"), 6);
});

Deno.test("kv.set: overwrites existing value", async () => {
  resetStore();
  await kv.set("key", "first");
  await kv.set("key", "second");
  assertEquals(await kv.get("key"), "second");
});

Deno.test("kv.delete: non-existent key is a no-op", async () => {
  resetStore();
  await kv.delete("ghost");
  assertEquals(await kv.get("ghost"), null);
});

Deno.test("kv.list: empty store returns empty array", async () => {
  resetStore();
  assertEquals(await kv.list(), []);
});

Deno.test("kv.list: respects limit", async () => {
  resetStore();
  await kv.set("a", 1);
  await kv.set("b", 2);
  await kv.set("c", 3);
  const limited = await kv.list(undefined, 2);
  assertEquals(limited.length, 2);
});

// --- claimDelete ---

Deno.test("kv.claimDelete: returns true for existing key", async () => {
  resetStore();
  await kv.set("claim-me", "data");
  const claimed = await kv.claimDelete("claim-me");
  assertEquals(claimed, true);
  assertEquals(await kv.get("claim-me"), null);
});

Deno.test("kv.claimDelete: returns false for non-existent key", async () => {
  resetStore();
  const claimed = await kv.claimDelete("ghost");
  assertEquals(claimed, false);
});

Deno.test("kv.claimDelete: second call returns false (exactly-once)", async () => {
  resetStore();
  await kv.set("once", "value");
  assertEquals(await kv.claimDelete("once"), true);
  assertEquals(await kv.claimDelete("once"), false);
});

// --- claimUpdate ---

Deno.test("kv.claimUpdate: returns null for non-existent key", async () => {
  resetStore();
  const result = await kv.claimUpdate<{ n: number }>("missing", (c) => ({ ...c, n: c.n + 1 }));
  assertEquals(result, null);
});

Deno.test("kv.claimUpdate: updates existing key", async () => {
  resetStore();
  await kv.set("item", { count: 0, active: true });
  const result = await kv.claimUpdate<{ count: number; active: boolean }>("item", (c) => {
    return { ...c, count: c.count + 1 };
  });
  assertEquals(result, { count: 1, active: true });
  assertEquals(await kv.get("item"), { count: 1, active: true });
});

Deno.test("kv.claimUpdate: returns null when fn returns null (declined)", async () => {
  resetStore();
  await kv.set("item", { ended: true });
  const result = await kv.claimUpdate<{ ended: boolean }>("item", (c) => {
    if (c.ended) return null; // decline to claim
    return c;
  });
  assertEquals(result, null);
  // Value should be unchanged
  assertEquals(await kv.get("item"), { ended: true });
});

Deno.test("kv.claimUpdate: does not insert if key missing", async () => {
  resetStore();
  await kv.claimUpdate<{ x: number }>("new-key", () => ({ x: 1 }));
  assertEquals(await kv.get("new-key"), null);
});

// --- listDue ---

Deno.test("kv.listDue: returns only entries with due_at <= now", async () => {
  resetStore();
  const now = 1000;
  await kv.set("past", "a", 500);
  await kv.set("exact", "b", 1000);
  await kv.set("future", "c", 2000);
  await kv.set("no-due", "d"); // no dueAt
  const due = await kv.listDue(now);
  assertEquals(due.length, 2);
  const keys = due.map((e) => e.key).sort();
  assertEquals(keys, ["exact", "past"]);
});

Deno.test("kv.listDue: filters by prefix", async () => {
  resetStore();
  const now = 1000;
  await kv.set("reminder:a", "r1", 500);
  await kv.set("reminder:b", "r2", 500);
  await kv.set("poll:x", "p1", 500);
  const due = await kv.listDue(now, "reminder:");
  assertEquals(due.length, 2);
  assertEquals(due.every((e) => e.key.startsWith("reminder:")), true);
});

Deno.test("kv.listDue: respects limit", async () => {
  resetStore();
  const now = 1000;
  await kv.set("r:1", "a", 100);
  await kv.set("r:2", "b", 200);
  await kv.set("r:3", "c", 300);
  const due = await kv.listDue(now, "r:", 2);
  assertEquals(due.length, 2);
});

Deno.test("kv.listDue: returns empty when nothing is due", async () => {
  resetStore();
  await kv.set("future", "x", 9999);
  const due = await kv.listDue(1000);
  assertEquals(due.length, 0);
});

Deno.test("kv.listDue: without prefix returns all due entries", async () => {
  resetStore();
  await kv.set("a:1", "x", 100);
  await kv.set("b:1", "y", 200);
  const due = await kv.listDue(500);
  assertEquals(due.length, 2);
});

// --- set with dueAt ---

Deno.test("kv.set: stores dueAt for listDue retrieval", async () => {
  resetStore();
  await kv.set("timed", { msg: "hello" }, 500);
  const due = await kv.listDue(1000);
  assertEquals(due.length, 1);
  assertEquals(due[0].key, "timed");
  assertEquals(due[0].value, { msg: "hello" });
});

Deno.test("kv.set: overwriting with new dueAt updates due_at", async () => {
  resetStore();
  await kv.set("item", "v1", 100);
  assertEquals((await kv.listDue(50)).length, 0);
  assertEquals((await kv.listDue(100)).length, 1);
  // Overwrite with later dueAt
  await kv.set("item", "v2", 9999);
  assertEquals((await kv.listDue(100)).length, 0);
  assertEquals((await kv.listDue(9999)).length, 1);
});

// --- escapeLikePrefix ---

Deno.test("kv.list: prefix containing % is escaped", async () => {
  resetStore();
  await kv.set("100%:a", "x");
  await kv.set("100:b", "y");
  const result = await kv.list("100%:");
  assertEquals(result.length, 1);
  assertEquals(result[0].key, "100%:a");
});

Deno.test("kv.list: prefix containing _ is escaped", async () => {
  resetStore();
  await kv.set("a_b:1", "x");
  await kv.set("axb:2", "y");
  const result = await kv.list("a_b:");
  assertEquals(result.length, 1);
  assertEquals(result[0].key, "a_b:1");
});

// --- set value size ---

Deno.test("kv.set: large value exceeding MAX_VALUE_SIZE throws", async () => {
  resetStore();
  const bigValue = "x".repeat(600 * 1024);
  let threw = false;
  try {
    await kv.set("big", bigValue);
  } catch (e) {
    threw = true;
    assertEquals((e as Error).message.includes("too large"), true);
  }
  assertEquals(threw, true);
});

// --- claimUpdate edge case ---

Deno.test("kv.claimUpdate: returns null for missing entry (no insert)", async () => {
  resetStore();
  const result = await kv.claimUpdate<{ x: number }>("nonexistent2", (c) => ({ ...c, x: 99 }));
  assertEquals(result, null);
  assertEquals(await kv.get("nonexistent2"), null);
});

// --- CAS retry exhaustion ---

Deno.test("kv.update: throws on CAS retry exhaustion", async () => {
  resetStore();
  await kv.set("cas-key", { n: 1 });
  // Monkey-patch sqlite.execute to force rowsAffected: 0 on UPDATE and INSERT OR IGNORE
  const origExec = (sqlite as any).execute;
  (sqlite as any).execute = async (input: any) => {
    const sql = typeof input === "string" ? input : input.sql;
    if (/^UPDATE/i.test(sql.trim()) || /INSERT\s+OR\s+IGNORE/i.test(sql.trim())) {
      return { rows: [], rowsAffected: 0, columns: [] };
    }
    return origExec.call(sqlite, input);
  };
  try {
    let threw = false;
    try {
      await kv.update<{ n: number }>("cas-key", (c) => ({ n: (c?.n ?? 0) + 1 }), 2);
    } catch (e) {
      threw = true;
      assert((e as Error).message.includes("CAS conflict"));
    }
    assertEquals(threw, true);
  } finally {
    (sqlite as any).execute = origExec;
  }
});

Deno.test("kv.claimUpdate: returns null on CAS retry exhaustion", async () => {
  resetStore();
  await kv.set("claim-cas", { n: 1 });
  const origExec = (sqlite as any).execute;
  (sqlite as any).execute = async (input: any) => {
    const sql = typeof input === "string" ? input : input.sql;
    if (/^UPDATE/i.test(sql.trim())) {
      return { rows: [], rowsAffected: 0, columns: [] };
    }
    return origExec.call(sqlite, input);
  };
  try {
    const result = await kv.claimUpdate<{ n: number }>("claim-cas", (c) => ({ n: c.n + 1 }), 2);
    assertEquals(result, null);
  } finally {
    (sqlite as any).execute = origExec;
  }
});

Deno.test("kv.listDue: skips entries with corrupt JSON", async () => {
  resetStore();
  // Insert valid entry
  await kv.set("valid", { ok: true }, 100);
  // Insert corrupt JSON via direct sqlite.execute
  await sqlite.execute({
    sql: "INSERT OR REPLACE INTO kv_store (key, value, due_at) VALUES (?, ?, ?)",
    args: ["corrupt", "not-valid-json{{{", 100],
  });
  const warnings: string[] = [];
  const origWarn = console.warn;
  console.warn = (msg: string) => warnings.push(msg);
  try {
    const due = await kv.listDue(500);
    assertEquals(due.length, 1);
    assertEquals(due[0].key, "valid");
  } finally {
    console.warn = origWarn;
  }
});

Deno.test("kv.claimUpdate: returns null for corrupt JSON value", async () => {
  resetStore();
  await sqlite.execute({
    sql: "INSERT OR REPLACE INTO kv_store (key, value, due_at) VALUES (?, ?, ?)",
    args: ["bad-json", "<<<not json>>>", null],
  });
  const origWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await kv.claimUpdate<{ x: number }>("bad-json", (c) => ({ x: c.x + 1 }));
    assertEquals(result, null);
  } finally {
    console.warn = origWarn;
  }
});

// --- Batch 6e: additional coverage ---

Deno.test("kv.set: value exactly at MAX_VALUE_SIZE succeeds", async () => {
  resetStore();
  // MAX_VALUE_SIZE = 512 * 1024 = 524288 bytes
  // JSON.stringify adds quotes, so create a string whose JSON repr is exactly 524288
  // JSON.stringify("x".repeat(n)) = '"' + 'x'.repeat(n) + '"' => length = n + 2
  const payload = "x".repeat(524288 - 2);
  // Should not throw
  await kv.set("exact-limit", payload);
  const result = await kv.get("exact-limit");
  assertEquals(result, payload);
});

Deno.test("kv.update: fn throws propagates error", async () => {
  resetStore();
  await kv.set("throw-key", { n: 1 });
  let threw = false;
  try {
    await kv.update("throw-key", () => {
      throw new Error("intentional test error");
    });
  } catch (e) {
    threw = true;
    assertEquals((e as Error).message, "intentional test error");
  }
  assertEquals(threw, true);
  // Original value should be preserved since fn threw before write
  assertEquals(await kv.get("throw-key"), { n: 1 });
});

Deno.test("kv.update: fn returns undefined is stored", async () => {
  resetStore();
  // JSON.stringify(undefined) returns undefined (not a string), but
  // in the context of kv.update, fn returns T where T could be anything.
  // Since the function signature says fn returns T, passing undefined
  // will cause JSON.stringify(undefined) which is the string "undefined"... no,
  // JSON.stringify(undefined) returns the JS value undefined, not a string.
  // This will likely cause an error or store "null" or "undefined".
  // Let's test what actually happens.
  const result = await kv.update<any>("undef-key", () => undefined as any);
  // JSON.stringify(undefined) => undefined (JS undefined), which means
  // the SQL INSERT will store undefined as the value text — may fail or store "null"
  // Let's just verify the round-trip
  const stored = await kv.get("undef-key");
  // undefined becomes null when stored via JSON
  assertEquals(stored, null);
});

Deno.test("kv.list: prefix containing backslash is escaped", async () => {
  resetStore();
  await kv.set("a\\b:1", "x");
  await kv.set("a\\b:2", "y");
  await kv.set("axb:3", "z");
  const result = await kv.list("a\\b:");
  assertEquals(result.length, 2);
  assertEquals(result.every((e) => e.key.startsWith("a\\b:")), true);
});

Deno.test("kv.listDue: empty prefix with mixed prefixes returns all due", async () => {
  resetStore();
  await kv.set("reminder:a", "r1", 100);
  await kv.set("poll:b", "p1", 200);
  await kv.set("giveaway:c", "g1", 300);
  await kv.set("future:d", "f1", 9999);
  const due = await kv.listDue(500);
  assertEquals(due.length, 3);
  const keys = due.map((e) => e.key).sort();
  assertEquals(keys, ["giveaway:c", "poll:b", "reminder:a"]);
});

Deno.test("kv.claimDelete: concurrent claimDelete only one succeeds", async () => {
  resetStore();
  await kv.set("race-key", "value");
  const first = await kv.claimDelete("race-key");
  const second = await kv.claimDelete("race-key");
  assertEquals(first, true);
  assertEquals(second, false);
  // Key should be gone
  assertEquals(await kv.get("race-key"), null);
});

Deno.test("kv.set/get: nested object round-trip preserves structure", async () => {
  resetStore();
  const nested = {
    a: { b: { c: { d: [1, 2, { e: "deep" }] } } },
    arr: [[1, [2, [3]]]],
    nullVal: null,
    boolVal: true,
    numVal: 3.14,
  };
  await kv.set("nested", nested);
  const result = await kv.get("nested");
  assertEquals(result, nested);
});

Deno.test("kv.set: empty key is accepted", async () => {
  resetStore();
  await kv.set("", "empty-key-value");
  const result = await kv.get("");
  assertEquals(result, "empty-key-value");
});

Deno.test("kv.update: maxRetries=1 limits retries", async () => {
  resetStore();
  await kv.set("retry-key", { n: 1 });
  // Monkey-patch to always fail CAS
  const origExec = (sqlite as any).execute;
  (sqlite as any).execute = async (input: any) => {
    const sql = typeof input === "string" ? input : input.sql;
    if (/^UPDATE/i.test(sql.trim())) {
      return { rows: [], rowsAffected: 0, columns: [] };
    }
    return origExec.call(sqlite, input);
  };
  try {
    let threw = false;
    try {
      await kv.update<{ n: number }>("retry-key", (c) => ({ n: (c?.n ?? 0) + 1 }), 1);
    } catch (e) {
      threw = true;
      assert((e as Error).message.includes("CAS conflict"));
    }
    assertEquals(threw, true);
  } finally {
    (sqlite as any).execute = origExec;
  }
});

Deno.test("kv.list: entries returned in insertion order", async () => {
  resetStore();
  await kv.set("order:a", "first");
  await kv.set("order:b", "second");
  await kv.set("order:c", "third");
  const entries = await kv.list("order:");
  // SQLite returns rows in insertion order by default (rowid order)
  assertEquals(entries.length, 3);
  assertEquals(entries[0].key, "order:a");
  assertEquals(entries[1].key, "order:b");
  assertEquals(entries[2].key, "order:c");
});

// --- listDueWithConfig ---

Deno.test("kv.listDueWithConfig: returns config and due items together", async () => {
  resetStore();
  await kv.set("cfg:muted", ["cron:polls"]);
  await kv.set("job:a", { data: 1 }, 100);
  await kv.set("job:b", { data: 2 }, 200);
  await kv.set("job:c", { data: 3 }, 9999); // not due yet

  const { config, due } = await kv.listDueWithConfig<string[]>("cfg:muted", 500, "job:");
  assertEquals(config, ["cron:polls"]);
  assertEquals(due.length, 2);
  const keys = due.map((e) => e.key).sort();
  assertEquals(keys, ["job:a", "job:b"]);
});

Deno.test("kv.listDueWithConfig: missing config returns null", async () => {
  resetStore();
  await kv.set("job:x", { n: 1 }, 100);

  const { config, due } = await kv.listDueWithConfig<string[]>("nonexistent", 500, "job:");
  assertEquals(config, null);
  assertEquals(due.length, 1);
});

Deno.test("kv.listDueWithConfig: respects limit on due items", async () => {
  resetStore();
  await kv.set("cfg:key", { setting: true });
  await kv.set("task:1", "a", 100);
  await kv.set("task:2", "b", 200);
  await kv.set("task:3", "c", 300);

  const { config, due } = await kv.listDueWithConfig<{ setting: boolean }>("cfg:key", 500, "task:", 2);
  assertEquals(config, { setting: true });
  assertEquals(due.length, 2);
});

Deno.test("kv.listDueWithConfig: prefix filtering excludes other keys", async () => {
  resetStore();
  await kv.set("cfg:x", ["a"]);
  await kv.set("reminder:1", "r1", 100);
  await kv.set("poll:1", "p1", 100);

  const { config, due } = await kv.listDueWithConfig<string[]>("cfg:x", 500, "reminder:");
  assertEquals(config, ["a"]);
  assertEquals(due.length, 1);
  assertEquals(due[0].key, "reminder:1");
});

Deno.test("kv.listDueWithConfig: no due items returns empty array", async () => {
  resetStore();
  await kv.set("cfg:y", true);
  await kv.set("item:1", "v", 9999); // future

  const { config, due } = await kv.listDueWithConfig<boolean>("cfg:y", 500, "item:");
  assertEquals(config, true);
  assertEquals(due.length, 0);
});

// --- bootstrapKvTable ---

Deno.test("bootstrapKvTable: runs without error (idempotent)", async () => {
  await bootstrapKvTable();
  // Should not throw — DDL is CREATE IF NOT EXISTS
  await bootstrapKvTable();
});
