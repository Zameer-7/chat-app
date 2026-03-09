/**
 * Simple in-memory cache with TTL for frequently accessed data.
 * Reduces repeated DB calls for hot data like friends lists, room members, and dashboard stats.
 *
 * For production scale, replace with Redis.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(cleanupIntervalMs = 60_000) {
    // Periodically purge expired entries to prevent memory leaks
    this.cleanupInterval = setInterval(() => this.purgeExpired(), cleanupIntervalMs);
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /** Invalidate a specific key */
  del(key: string): void {
    this.store.delete(key);
  }

  /** Invalidate all keys matching a prefix */
  invalidatePrefix(prefix: string): void {
    Array.from(this.store.keys()).forEach((key) => {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    });
  }

  private purgeExpired(): void {
    const now = Date.now();
    Array.from(this.store.entries()).forEach(([key, entry]) => {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    });
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

export const cache = new MemoryCache();

// Cache key builders + TTL constants
export const CACHE_TTL = {
  FRIENDS_LIST: 30_000,        // 30s — changes on friend accept/remove
  ROOM_MEMBERS: 30_000,        // 30s — changes on join/leave
  ROOM_STATS: 60_000,          // 60s
  PROFILE_OVERVIEW: 60_000,    // 60s
  UNREAD_COUNTS: 10_000,       // 10s — frequently polled
} as const;

export const cacheKey = {
  friends: (userId: number) => `friends:${userId}`,
  friendIds: (userId: number) => `friendIds:${userId}`,
  roomMembers: (roomId: string) => `roomMembers:${roomId}`,
  roomStats: (roomId: string) => `roomStats:${roomId}`,
  profileOverview: (userId: number) => `profile:${userId}`,
  unreadCounts: (userId: number) => `unread:${userId}`,
} as const;
