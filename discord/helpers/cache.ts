/**
 * discord/helpers/cache.ts
 *
 * Generic TTL cache with max-entry eviction.
 * Replaces identical cache patterns across paste, template, tag, stash, backup, schedule.
 */

export class ExpiringCache<K, V> {
  private store = new Map<K, { value: V; expiresAt: number }>();

  constructor(private ttlMs: number, private maxEntries: number) {}

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V): void {
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: K): void {
    this.store.delete(key);
  }

  async getOrFetch(key: K, fetcher: () => Promise<V>): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await fetcher();
    this.set(key, value);
    return value;
  }
}
