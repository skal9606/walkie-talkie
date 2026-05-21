// Daily-practice streak. SERVER is the source of truth (Supabase profiles
// table, fields streak_count + streak_last_day) so iOS and web share one
// number — having a conversation on web today and on iOS tomorrow extends
// the same streak. The server ticks the count via /api/heartbeat once a
// session crosses 60s.
//
// localStorage is used here ONLY as a cache so display calls (currentStreak)
// stay synchronous and the home page can render the badge without waiting on
// the network. The cache is refreshed every time the client receives a
// streak field from the server (mintSession response, heartbeat response).
//
// Migration note: pre-2026-05-21 builds stored an authoritative streak in
// 'walkie_streak_v1'. Those rows are abandoned — users start fresh on the
// new system. Considered porting them up but the failure mode (lose one
// streak) is mild and the migration code carries forever; not worth it.

const CACHE_KEY = 'walkie_streak_v2'

/** Minimum session duration (ms) that counts as a practice day. Mirrors the
 *  server-side constant. Kept exported for callers that decide whether to
 *  show "almost there" UX hints. */
export const PRACTICE_THRESHOLD_MS = 60_000

type StreakCache = {
  streakCount: number
  /** YYYY-MM-DD in the learner's local timezone, or '' if no streak yet. */
  streakLastDay: string
}

function localDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function todayLocal(): string {
  return localDateString(new Date())
}

function yesterdayLocal(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return localDateString(d)
}

function readCache(): StreakCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return { streakCount: 0, streakLastDay: '' }
    const parsed = JSON.parse(raw) as Partial<StreakCache>
    if (
      typeof parsed.streakCount === 'number' &&
      typeof parsed.streakLastDay === 'string'
    ) {
      return { streakCount: parsed.streakCount, streakLastDay: parsed.streakLastDay }
    }
    return { streakCount: 0, streakLastDay: '' }
  } catch {
    return { streakCount: 0, streakLastDay: '' }
  }
}

function writeCache(c: StreakCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c))
  } catch {
    // ignore quota / private mode
  }
}

/**
 * The streak value to render right now. Applies the today/yesterday rule
 * locally against the cached server values so we don't need a network call
 * to know whether to show 0 (broken) or N (still alive).
 */
export function currentStreak(): number {
  const { streakCount, streakLastDay } = readCache()
  if (!streakLastDay) return 0
  if (streakLastDay === todayLocal() || streakLastDay === yesterdayLocal()) {
    return streakCount
  }
  return 0
}

/**
 * Update the cache from a server response. Call this on every payload that
 * carries fresh streak fields — mintSession (/api/session) and heartbeat
 * (/api/heartbeat) both return them.
 */
export function applyServerStreak(streakCount: number, streakLastDay: string | null): void {
  writeCache({
    streakCount: Number.isFinite(streakCount) ? Math.max(0, Math.floor(streakCount)) : 0,
    streakLastDay: streakLastDay ?? '',
  })
}

/** Local-date string in the shape the server expects (YYYY-MM-DD, local TZ). */
export function todayLocalDate(): string {
  return todayLocal()
}

/**
 * Deprecated — server ticks the streak via the heartbeat. Kept as a no-op
 * for back-compat with any caller we haven't migrated yet.
 */
export function recordPractice(): void {
  // No-op. The server is now the source of truth; streak advancement
  // happens via /api/heartbeat once the session crosses 60s.
}

export function clearStreak(): void {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    // ignore
  }
}
