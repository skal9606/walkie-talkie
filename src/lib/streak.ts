// Daily-practice streak. A "practice day" = a single session of >= 30s in
// the learner's local time zone. Stored in localStorage as the current
// streak count + the most-recent practice date. The streak is visible (>0)
// if the user practiced today or yesterday; once a calendar day passes with
// no practice, the next session starts a new streak from 1.

const STORAGE_KEY = 'walkie_streak_v1'

/** Minimum session duration (ms) that counts as a practice day. */
export const PRACTICE_THRESHOLD_MS = 30_000

type StreakRecord = {
  streak: number
  /** YYYY-MM-DD in the learner's local timezone. */
  lastPracticeDate: string
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

function readRaw(): StreakRecord {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { streak: 0, lastPracticeDate: '' }
    const parsed = JSON.parse(raw) as Partial<StreakRecord>
    if (
      typeof parsed.streak === 'number' &&
      typeof parsed.lastPracticeDate === 'string'
    ) {
      return { streak: parsed.streak, lastPracticeDate: parsed.lastPracticeDate }
    }
    return { streak: 0, lastPracticeDate: '' }
  } catch {
    return { streak: 0, lastPracticeDate: '' }
  }
}

function writeRaw(record: StreakRecord): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Returns the streak that should be displayed right now.
 *  - If the last practice was today: stored streak.
 *  - If it was yesterday: stored streak (still alive — practice today to
 *    extend it).
 *  - Anything older or missing: 0 (broken streak).
 */
export function currentStreak(): number {
  const { streak, lastPracticeDate } = readRaw()
  if (!lastPracticeDate) return 0
  const today = todayLocal()
  const yesterday = yesterdayLocal()
  if (lastPracticeDate === today || lastPracticeDate === yesterday) {
    return streak
  }
  return 0
}

/**
 * Records a completed practice session for today, advancing the streak.
 * No-op if today already counted. Resets to 1 if the streak had lapsed.
 */
export function recordPractice(): void {
  const today = todayLocal()
  const yesterday = yesterdayLocal()
  const { streak, lastPracticeDate } = readRaw()
  if (lastPracticeDate === today) return
  const newStreak = lastPracticeDate === yesterday ? streak + 1 : 1
  writeRaw({ streak: newStreak, lastPracticeDate: today })
}

export function clearStreak(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
