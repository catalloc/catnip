/**
 * test/_mocks/sqlite.ts
 *
 * In-memory SQLite mock matching Val Town's API shape.
 * Call sqlite._reset() between tests for isolation.
 */

const store = new Map<string, string>();
const dueAtStore = new Map<string, number | null>();

function parseQuery(input: string | { sql: string; args?: any[] }) {
  const sql = typeof input === "string" ? input : input.sql;
  const args = typeof input === "string" ? [] : (input.args ?? []);
  return { sql: sql.trim(), args };
}

/** Unescape SQL LIKE backslash-escaped chars to get a literal prefix. */
function unescapeLikePrefix(pattern: string): string {
  return pattern.replace(/%$/, "").replace(/\\(.)/g, "$1");
}

export const sqlite = {
  async execute(input: string | { sql: string; args?: any[] }) {
    const { sql, args } = parseQuery(input);

    // CREATE TABLE / CREATE INDEX
    if (sql.toUpperCase().startsWith("CREATE TABLE") || sql.toUpperCase().startsWith("CREATE INDEX")) {
      return { rows: [], rowsAffected: 0, columns: [] };
    }

    // SELECT value FROM ... WHERE key = ?
    if (/SELECT\s+value\s+FROM/i.test(sql) && sql.includes("key = ?")) {
      const key = args[0] as string;
      const value = store.get(key);
      return {
        rows: value !== undefined ? [[value]] : [],
        rowsAffected: 0,
        columns: ["value"],
      };
    }

    // SELECT key, value FROM ... WHERE due_at IS NOT NULL AND due_at <= ? AND key LIKE ?
    if (/SELECT\s+key,\s*value\s+FROM/i.test(sql) && sql.includes("due_at") && sql.includes("LIKE ?")) {
      const now = args[0] as number;
      const pattern = args[1] as string;
      const prefix = unescapeLikePrefix(pattern);
      const rows = [...store.entries()]
        .filter(([k]) => k.startsWith(prefix))
        .filter(([k]) => {
          const dueAt = dueAtStore.get(k);
          return dueAt !== null && dueAt !== undefined && dueAt <= now;
        })
        .map(([k, v]) => [k, v]);
      return { rows, rowsAffected: 0, columns: ["key", "value"] };
    }

    // SELECT key, value FROM ... WHERE due_at IS NOT NULL AND due_at <= ?
    if (/SELECT\s+key,\s*value\s+FROM/i.test(sql) && sql.includes("due_at") && !sql.includes("LIKE")) {
      const now = args[0] as number;
      const rows = [...store.entries()]
        .filter(([k]) => {
          const dueAt = dueAtStore.get(k);
          return dueAt !== null && dueAt !== undefined && dueAt <= now;
        })
        .map(([k, v]) => [k, v]);
      return { rows, rowsAffected: 0, columns: ["key", "value"] };
    }

    // SELECT key, value FROM ... WHERE key LIKE ?
    if (/SELECT\s+key,\s*value\s+FROM/i.test(sql) && sql.includes("LIKE ?")) {
      const pattern = args[0] as string;
      const prefix = unescapeLikePrefix(pattern);
      const rows = [...store.entries()]
        .filter(([k]) => k.startsWith(prefix))
        .map(([k, v]) => [k, v]);
      return { rows, rowsAffected: 0, columns: ["key", "value"] };
    }

    // SELECT key, value FROM ... (no WHERE)
    if (/SELECT\s+key,\s*value\s+FROM/i.test(sql) && !sql.includes("WHERE")) {
      const rows = [...store.entries()].map(([k, v]) => [k, v]);
      return { rows, rowsAffected: 0, columns: ["key", "value"] };
    }

    // INSERT OR REPLACE
    if (/INSERT\s+OR\s+REPLACE/i.test(sql)) {
      const key = args[0] as string;
      const value = args[1] as string;
      store.set(key, value);
      dueAtStore.set(key, args.length > 2 ? (args[2] as number | null) : null);
      return { rows: [], rowsAffected: 1, columns: [] };
    }

    // INSERT OR IGNORE
    if (/INSERT\s+OR\s+IGNORE/i.test(sql)) {
      const key = args[0] as string;
      const value = args[1] as string;
      if (!store.has(key)) {
        store.set(key, value);
        dueAtStore.set(key, args.length > 2 ? (args[2] as number | null) : null);
        return { rows: [], rowsAffected: 1, columns: [] };
      }
      return { rows: [], rowsAffected: 0, columns: [] };
    }

    // UPDATE ... SET value = ? WHERE key = ? AND value = ?
    if (sql.toUpperCase().startsWith("UPDATE")) {
      const newValue = args[0] as string;
      const key = args[1] as string;
      const oldValue = args[2] as string;
      if (store.get(key) === oldValue) {
        store.set(key, newValue);
        return { rows: [], rowsAffected: 1, columns: [] };
      }
      return { rows: [], rowsAffected: 0, columns: [] };
    }

    // DELETE FROM ... WHERE key = ?
    if (sql.toUpperCase().startsWith("DELETE")) {
      const key = args[0] as string;
      const had = store.has(key);
      store.delete(key);
      dueAtStore.delete(key);
      return { rows: [], rowsAffected: had ? 1 : 0, columns: [] };
    }

    return { rows: [], rowsAffected: 0, columns: [] };
  },

  _reset() {
    store.clear();
    dueAtStore.clear();
  },
};
