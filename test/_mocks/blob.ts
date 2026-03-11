/**
 * test/_mocks/blob.ts
 *
 * In-memory blob storage mock matching Val Town's blob API shape.
 * Call blob._reset() between tests for isolation.
 */

const store = new Map<string, string>();

export const blob = {
  async getJSON<T = unknown>(key: string): Promise<T | undefined> {
    const raw = store.get(key);
    if (raw === undefined) return undefined;
    return JSON.parse(raw) as T;
  },

  async setJSON(key: string, value: unknown): Promise<void> {
    store.set(key, JSON.stringify(value));
  },

  async delete(key: string): Promise<void> {
    store.delete(key);
  },

  async list(prefix?: string): Promise<Array<{ key: string; size: number; lastModified: string }>> {
    const results: Array<{ key: string; size: number; lastModified: string }> = [];
    for (const [key, value] of store.entries()) {
      if (prefix && !key.startsWith(prefix)) continue;
      results.push({
        key,
        size: new Blob([value]).size,
        lastModified: new Date().toISOString(),
      });
    }
    return results;
  },

  async copy(from: string, to: string): Promise<void> {
    const value = store.get(from);
    if (value !== undefined) {
      store.set(to, value);
    }
  },

  async move(from: string, to: string): Promise<void> {
    const value = store.get(from);
    if (value !== undefined) {
      store.set(to, value);
      store.delete(from);
    }
  },

  _reset(): void {
    store.clear();
  },
};
