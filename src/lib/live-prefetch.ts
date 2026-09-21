/// Short-lived cache for the GPT-Live "prepare" call (access check +
/// learner state). The call costs ~0.5–1.3s and its result is stable for
/// minutes, so pages that lead into /chat start it early and the Tutor
/// page picks it up instead of paying for it on the critical path
/// (start-latency investigation, 2026-09-20).
///
/// Keyed by user + language so a sign-out/sign-in or a tutor switch can't
/// serve another learner's state. Entries are single-use: the first
/// consumer takes it, so `secondsRemaining` is never reused after a
/// session has actually burned trial time.

export const LIVE_PREFETCH_TTL_MS = 45_000

type Entry<T> = { promise: Promise<T>; at: number }

export class PrefetchCache<T> {
  private entries = new Map<string, Entry<T>>()
  constructor(
    private readonly ttlMs: number = LIVE_PREFETCH_TTL_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /// Start (or reuse an in-flight/fresh) fetch for `key`.
  prime(key: string, fetcher: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key)
    if (existing && this.now() - existing.at <= this.ttlMs) return existing.promise
    const promise = fetcher()
    // A failed prefetch must not poison the real call: drop it so the
    // consumer refetches.
    promise.catch(() => {
      if (this.entries.get(key)?.promise === promise) this.entries.delete(key)
    })
    this.entries.set(key, { promise, at: this.now() })
    return promise
  }

  /// Take a fresh entry for `key` (removing it) or return null.
  take(key: string): Promise<T> | null {
    const existing = this.entries.get(key)
    if (!existing) return null
    this.entries.delete(key)
    return this.now() - existing.at <= this.ttlMs ? existing.promise : null
  }

  clear() {
    this.entries.clear()
  }
}

export function livePrefetchKey(userId: string, language: string): string {
  return `${userId}:${language}`
}
