/**
 * discord/persistence/kv.ts
 *
 * Minimal key-value store wrapping Val Town SQLite.
 * Auto-creates the table on first use.
 *
 * Supports an optional `due_at` column (epoch ms) for time-based queries,
 * enabling cron jobs to fetch only due items via `listDue()` instead of
 * loading all entries and filtering in JS.
 */

import { sqlite } from "https://esm.town/v/std/sqlite/main.ts";

const TABLE = "kv_store";
const SQLITE_TIMEOUT_MS = 5_000;
const MAX_VALUE_SIZE = 512 * 1024; // 512 KB
let initPromise: Promise<void> | null = null;

/** Wraps sqlite.execute with a timeout to prevent indefinite hangs. */
function sqliteExec(...args: Parameters<typeof sqlite.execute>): ReturnType<typeof sqlite.execute> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    sqlite.execute(...args).finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("SQLite operation timed out")), SQLITE_TIMEOUT_MS);
    }),
  ]);
}

function ensureTable(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      await sqliteExec(
        `CREATE TABLE IF NOT EXISTS ${TABLE} (key TEXT PRIMARY KEY, value TEXT NOT NULL, due_at INTEGER)`,
      );
      await sqliteExec(
        `CREATE INDEX IF NOT EXISTS idx_kv_due_at ON ${TABLE} (due_at) WHERE due_at IS NOT NULL`,
      );
      await sqliteExec(
        `CREATE INDEX IF NOT EXISTS idx_kv_due_at_key ON ${TABLE} (due_at, key) WHERE due_at IS NOT NULL`,
      );
    } catch (e) {
      initPromise = null;
      throw e;
    }
  })();
  return initPromise;
}

function escapeLikePrefix(prefix: string): string {
  return prefix.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function safeParse<T>(raw: string, key?: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.warn(`[KV] Failed to parse value${key ? ` for key "${key}"` : ""}: ${raw.slice(0, 100)}`);
    return null;
  }
}

export const kv = {
  async get<T = unknown>(key: string): Promise<T | null> {
    await ensureTable();
    const result = await sqliteExec({
      sql: `SELECT value FROM ${TABLE} WHERE key = ?`,
      args: [key],
    });
    if (result.rows.length === 0) return null;
    return safeParse<T>(result.rows[0][0] as string, key);
  },

  async set(key: string, value: unknown, dueAt?: number): Promise<void> {
    await ensureTable();
    const json = JSON.stringify(value);
    if (json.length > MAX_VALUE_SIZE) {
      throw new Error(`[KV] Value too large for key "${key}": ${json.length} bytes (max ${MAX_VALUE_SIZE})`);
    }
    await sqliteExec({
      sql: `INSERT OR REPLACE INTO ${TABLE} (key, value, due_at) VALUES (?, ?, ?)`,
      args: [key, json, dueAt ?? null],
    });
  },

  async delete(key: string): Promise<void> {
    await ensureTable();
    await sqliteExec({
      sql: `DELETE FROM ${TABLE} WHERE key = ?`,
      args: [key],
    });
  },

  /**
   * Atomically delete a key and return whether it actually existed.
   * Only one concurrent caller can "win" the delete — use this as a
   * claim mechanism so overlapping cron runs don't double-process items.
   */
  async claimDelete(key: string): Promise<boolean> {
    await ensureTable();
    const result = await sqliteExec({
      sql: `DELETE FROM ${TABLE} WHERE key = ?`,
      args: [key],
    });
    return result.rowsAffected > 0;
  },

  async list(prefix?: string, limit?: number): Promise<Array<{ key: string; value: unknown }>> {
    await ensureTable();
    const result = prefix
      ? await sqliteExec({
          sql: `SELECT key, value FROM ${TABLE} WHERE key LIKE ? ESCAPE '\\'`,
          args: [`${escapeLikePrefix(prefix)}%`],
        })
      : await sqliteExec(`SELECT key, value FROM ${TABLE}`);
    const entries: Array<{ key: string; value: unknown }> = [];
    for (const row of result.rows) {
      if (limit !== undefined && entries.length >= limit) break;
      const rowKey = row[0] as string;
      const parsed = safeParse(row[1] as string, rowKey);
      if (parsed !== null) {
        entries.push({ key: rowKey, value: parsed });
      }
    }
    return entries;
  },

  /**
   * List entries whose `due_at` is at or before the given timestamp.
   * Uses the indexed due_at column — much faster than list() + JS filter.
   * Optionally filtered by key prefix.
   */
  async listDue(now: number, prefix?: string, limit?: number): Promise<Array<{ key: string; value: unknown }>> {
    await ensureTable();
    const result = prefix
      ? await sqliteExec({
          sql: `SELECT key, value FROM ${TABLE} WHERE due_at IS NOT NULL AND due_at <= ? AND key LIKE ? ESCAPE '\\'`,
          args: [now, `${escapeLikePrefix(prefix)}%`],
        })
      : await sqliteExec({
          sql: `SELECT key, value FROM ${TABLE} WHERE due_at IS NOT NULL AND due_at <= ?`,
          args: [now],
        });
    const entries: Array<{ key: string; value: unknown }> = [];
    for (const row of result.rows) {
      if (limit !== undefined && entries.length >= limit) break;
      const rowKey = row[0] as string;
      const parsed = safeParse(row[1] as string, rowKey);
      if (parsed !== null) {
        entries.push({ key: rowKey, value: parsed });
      }
    }
    return entries;
  },

  /**
   * Atomic read-modify-write. Reads the current value, passes it to `fn`,
   * and writes the result back. Retries up to `maxRetries` times on conflict
   * (value changed between read and write).
   */
  async update<T>(key: string, fn: (current: T | null) => T, maxRetries = 3): Promise<T> {
    await ensureTable();
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await sqliteExec({
        sql: `SELECT value FROM ${TABLE} WHERE key = ?`,
        args: [key],
      });
      const oldRaw = result.rows.length > 0 ? (result.rows[0][0] as string) : null;
      const current = oldRaw !== null ? safeParse<T>(oldRaw, key) : null;
      const next = fn(current);
      const nextRaw = JSON.stringify(next);

      // Optimistic concurrency: only write if the value hasn't changed since we read it
      const writeResult = oldRaw !== null
        ? await sqliteExec({
            sql: `UPDATE ${TABLE} SET value = ? WHERE key = ? AND value = ?`,
            args: [nextRaw, key, oldRaw],
          })
        : await sqliteExec({
            sql: `INSERT OR IGNORE INTO ${TABLE} (key, value) VALUES (?, ?)`,
            args: [key, nextRaw],
          });

      if (writeResult.rowsAffected > 0) return next;
    }
    // All CAS retries exhausted
    throw new Error(`[KV] update() failed: CAS conflict on key "${key}" after ${maxRetries} retries`);
  },

  /**
   * Atomic claim-and-update. Like `update()` but with strict claim semantics:
   * - Returns `null` if key doesn't exist (no spurious inserts)
   * - Returns `null` if `fn` returns `null` (caller signals "don't claim")
   * - Returns `null` if all CAS retries exhausted (another writer won)
   * - No unconditional fallback — guarantees exactly-once claiming
   */
  async claimUpdate<T>(key: string, fn: (current: T) => T | null, maxRetries = 3): Promise<T | null> {
    await ensureTable();
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await sqliteExec({
        sql: `SELECT value FROM ${TABLE} WHERE key = ?`,
        args: [key],
      });
      if (result.rows.length === 0) return null; // key doesn't exist

      const oldRaw = result.rows[0][0] as string;
      const current = safeParse<T>(oldRaw, key);
      if (current === null) return null; // unparseable

      const next = fn(current);
      if (next === null) return null; // caller declined to claim

      const nextRaw = JSON.stringify(next);
      const writeResult = await sqliteExec({
        sql: `UPDATE ${TABLE} SET value = ? WHERE key = ? AND value = ?`,
        args: [nextRaw, key, oldRaw],
      });

      if (writeResult.rowsAffected > 0) return next;
      // CAS conflict — retry
    }
    return null; // all retries exhausted
  },
};

export const _internals = { safeParse, escapeLikePrefix };
