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
let initialized = false;

async function ensureTable(): Promise<void> {
  if (initialized) return;
  await sqlite.execute(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (key TEXT PRIMARY KEY, value TEXT NOT NULL, due_at INTEGER)`,
  );
  await sqlite.execute(
    `CREATE INDEX IF NOT EXISTS idx_kv_due_at ON ${TABLE} (due_at) WHERE due_at IS NOT NULL`,
  );
  initialized = true;
}

function escapeLikePrefix(prefix: string): string {
  return prefix.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const kv = {
  async get<T = unknown>(key: string): Promise<T | null> {
    await ensureTable();
    const result = await sqlite.execute({
      sql: `SELECT value FROM ${TABLE} WHERE key = ?`,
      args: [key],
    });
    if (result.rows.length === 0) return null;
    return safeParse<T>(result.rows[0][0] as string);
  },

  async set(key: string, value: unknown, dueAt?: number): Promise<void> {
    await ensureTable();
    await sqlite.execute({
      sql: `INSERT OR REPLACE INTO ${TABLE} (key, value, due_at) VALUES (?, ?, ?)`,
      args: [key, JSON.stringify(value), dueAt ?? null],
    });
  },

  async delete(key: string): Promise<void> {
    await ensureTable();
    await sqlite.execute({
      sql: `DELETE FROM ${TABLE} WHERE key = ?`,
      args: [key],
    });
  },

  async list(prefix?: string): Promise<Array<{ key: string; value: unknown }>> {
    await ensureTable();
    const result = prefix
      ? await sqlite.execute({
          sql: `SELECT key, value FROM ${TABLE} WHERE key LIKE ? ESCAPE '\\'`,
          args: [`${escapeLikePrefix(prefix)}%`],
        })
      : await sqlite.execute(`SELECT key, value FROM ${TABLE}`);
    const entries: Array<{ key: string; value: unknown }> = [];
    for (const row of result.rows) {
      const parsed = safeParse(row[1] as string);
      if (parsed !== null) {
        entries.push({ key: row[0] as string, value: parsed });
      }
    }
    return entries;
  },

  /**
   * List entries whose `due_at` is at or before the given timestamp.
   * Uses the indexed due_at column — much faster than list() + JS filter.
   * Optionally filtered by key prefix.
   */
  async listDue(now: number, prefix?: string): Promise<Array<{ key: string; value: unknown }>> {
    await ensureTable();
    const result = prefix
      ? await sqlite.execute({
          sql: `SELECT key, value FROM ${TABLE} WHERE due_at IS NOT NULL AND due_at <= ? AND key LIKE ? ESCAPE '\\'`,
          args: [now, `${escapeLikePrefix(prefix)}%`],
        })
      : await sqlite.execute({
          sql: `SELECT key, value FROM ${TABLE} WHERE due_at IS NOT NULL AND due_at <= ?`,
          args: [now],
        });
    const entries: Array<{ key: string; value: unknown }> = [];
    for (const row of result.rows) {
      const parsed = safeParse(row[1] as string);
      if (parsed !== null) {
        entries.push({ key: row[0] as string, value: parsed });
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
      const result = await sqlite.execute({
        sql: `SELECT value FROM ${TABLE} WHERE key = ?`,
        args: [key],
      });
      const oldRaw = result.rows.length > 0 ? (result.rows[0][0] as string) : null;
      const current = oldRaw !== null ? safeParse<T>(oldRaw) : null;
      const next = fn(current);
      const nextRaw = JSON.stringify(next);

      // Optimistic concurrency: only write if the value hasn't changed since we read it
      const writeResult = oldRaw !== null
        ? await sqlite.execute({
            sql: `UPDATE ${TABLE} SET value = ? WHERE key = ? AND value = ?`,
            args: [nextRaw, key, oldRaw],
          })
        : await sqlite.execute({
            sql: `INSERT OR IGNORE INTO ${TABLE} (key, value) VALUES (?, ?)`,
            args: [key, nextRaw],
          });

      if (writeResult.rowsAffected > 0) return next;
    }
    // Final fallback: unconditional write (better than losing the operation)
    const result = await sqlite.execute({
      sql: `SELECT value FROM ${TABLE} WHERE key = ?`,
      args: [key],
    });
    const raw = result.rows.length > 0 ? (result.rows[0][0] as string) : null;
    const current = raw !== null ? safeParse<T>(raw) : null;
    const next = fn(current);
    await sqlite.execute({
      sql: `INSERT OR REPLACE INTO ${TABLE} (key, value) VALUES (?, ?)`,
      args: [key, JSON.stringify(next)],
    });
    return next;
  },
};

export const _internals = { safeParse, escapeLikePrefix };
