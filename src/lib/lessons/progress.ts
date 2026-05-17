// Per-(language, lesson) progress, persisted in localStorage. Mirror of
// the iOS LessonProgress @Model — same state machine, same scoping by
// languageCode. localStorage is fine because the catalogue is tiny
// (~180 rows max, even at full saturation).
//
// State machine:
//   not_started (no row) → in_progress → completed
// Completion gate is enforced at write time (callers pass the duration
// + user-turn count via markLessonAttempt).

import type { LessonProgressState } from './types'

const STORAGE_KEY = 'walkietalkie.lessonProgress.v1'

type ProgressRow = {
  languageCode: string
  lessonId: string
  state: LessonProgressState
  /** ISO timestamps so we can read/write across the JSON serialization
   *  boundary without losing precision. */
  startedAt?: string
  completedAt?: string
}

type ProgressMap = Record<string, ProgressRow> // key: `${lang}::${lessonId}`

function key(languageCode: string, lessonId: string): string {
  return `${languageCode}::${lessonId}`
}

function readAll(): ProgressMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as ProgressMap) : {}
  } catch {
    return {}
  }
}

function writeAll(map: ProgressMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Quota / privacy mode — silently no-op. Progress won't persist this
    // session but the UI keeps working.
  }
}

export function allProgress(): ProgressRow[] {
  return Object.values(readAll())
}

export function progressState(languageCode: string, lessonId: string): LessonProgressState {
  return readAll()[key(languageCode, lessonId)]?.state ?? 'not_started'
}

/** Build a lessonId → state lookup for one language. Used by the home
 *  view so each row doesn't re-read localStorage. */
export function stateLookup(languageCode: string): Record<string, LessonProgressState> {
  const out: Record<string, LessonProgressState> = {}
  for (const row of Object.values(readAll())) {
    if (row.languageCode === languageCode) {
      out[row.lessonId] = row.state
    }
  }
  return out
}

/** Count of lessons completed in one language. */
export function lessonsCompleted(languageCode: string): number {
  let n = 0
  for (const row of Object.values(readAll())) {
    if (row.languageCode === languageCode && row.state === 'completed') n++
  }
  return n
}

/**
 * Mark a lesson attempt based on session metrics. Mirrors the iOS gate:
 *  - completed   if elapsedSeconds >= 60 AND userTurnCount >= 3
 *  - in_progress if elapsedSeconds >= 15 OR  userTurnCount >= 1
 *  - no-op otherwise
 *
 * Returns the resulting state (or null on no-op). Once completed, the
 * row is never demoted back to in_progress on a shorter re-run.
 */
export function markLessonAttempt(
  languageCode: string,
  lessonId: string,
  metrics: { elapsedSeconds: number; userTurnCount: number },
): LessonProgressState | null {
  const { elapsedSeconds, userTurnCount } = metrics
  let nextState: LessonProgressState
  if (elapsedSeconds >= 60 && userTurnCount >= 3) {
    nextState = 'completed'
  } else if (elapsedSeconds >= 15 || userTurnCount >= 1) {
    nextState = 'in_progress'
  } else {
    return null
  }

  const map = readAll()
  const k = key(languageCode, lessonId)
  const existing = map[k]
  if (existing?.state === 'completed') return 'completed' // never demote

  const now = new Date().toISOString()
  const row: ProgressRow = {
    languageCode,
    lessonId,
    state: nextState,
    startedAt: existing?.startedAt ?? (nextState === 'in_progress' ? now : undefined),
    completedAt: nextState === 'completed' ? now : existing?.completedAt,
  }
  map[k] = row
  writeAll(map)
  return nextState
}

/** Reset progress — used by Settings → Delete data. */
export function clearAllProgress(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
