// Learner profile, built incrementally:
//   1. Empty on first visit — no onboarding.
//   2. After the first session, /api/review may extract `name` + `level`.
//      We merge those in (only fields that aren't already user-set).
//   3. Post-subscribe questionnaire fills in `nativeLanguage` + `goals` and
//      sets `questionnaireCompleted` so we don't re-prompt.

import type { Level } from './scenarios'

const STORAGE_KEY = 'walkie_profile_v1'

export type LearnerProfile = {
  name?: string
  level?: Level
  /** Native language, free-text. Captured in the post-subscribe questionnaire. */
  nativeLanguage?: string
  /** Goal text, free-form. Captured in the post-subscribe questionnaire. */
  goals?: string
  /** True once the user submits the post-subscribe questionnaire. */
  questionnaireCompleted?: boolean
}

function isLevel(v: unknown): v is Level {
  return (
    v === 'complete-beginner' ||
    v === 'novice' ||
    v === 'intermediate' ||
    v === 'advanced'
  )
}

export function loadProfile(): LearnerProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LearnerProfile>
    const profile: LearnerProfile = {}
    if (typeof parsed.name === 'string' && parsed.name.trim()) {
      profile.name = parsed.name.trim()
    }
    if (isLevel(parsed.level)) profile.level = parsed.level
    if (typeof parsed.nativeLanguage === 'string' && parsed.nativeLanguage.trim()) {
      profile.nativeLanguage = parsed.nativeLanguage.trim()
    }
    if (typeof parsed.goals === 'string' && parsed.goals.trim()) {
      profile.goals = parsed.goals.trim()
    }
    if (parsed.questionnaireCompleted === true) {
      profile.questionnaireCompleted = true
    }
    return profile
  } catch {
    return null
  }
}

export function saveProfile(profile: LearnerProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  } catch {
    // localStorage can throw in private-browsing / quota-exceeded scenarios.
  }
}

/**
 * Merges fields into the existing profile, but only fills BLANKS — never
 * overwrites a value the user has already confirmed (e.g. an inferred name
 * shouldn't replace one the user typed in the questionnaire).
 */
export function mergeProfileBlanks(updates: Partial<LearnerProfile>): LearnerProfile {
  const existing = loadProfile() ?? {}
  const merged: LearnerProfile = { ...existing }
  if (!merged.name && updates.name?.trim()) merged.name = updates.name.trim()
  if (!merged.level && updates.level && isLevel(updates.level)) merged.level = updates.level
  if (!merged.nativeLanguage && updates.nativeLanguage?.trim()) {
    merged.nativeLanguage = updates.nativeLanguage.trim()
  }
  if (!merged.goals && updates.goals?.trim()) merged.goals = updates.goals.trim()
  if (updates.questionnaireCompleted === true) merged.questionnaireCompleted = true
  saveProfile(merged)
  return merged
}

/** True if we've completed the post-subscribe questionnaire. */
export function hasFullProfile(profile: LearnerProfile | null): boolean {
  return !!profile?.questionnaireCompleted
}

export function clearProfile(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
