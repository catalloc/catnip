import "../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../test/assert.ts";
import { sqlite } from "https://esm.town/v/std/sqlite/main.ts";
import { kv, _internals } from "./kv.ts";

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
