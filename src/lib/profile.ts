// Learner profile, built incrementally:
//   1. Empty on first visit.
//   2. New initial onboarding (pre-first-session) sets nativeLanguage,
//      targetLanguage, and tutorId.
//   3. After the first session, /api/review may extract `name` + `level`.
//   4. Post-subscribe questionnaire fills in `goals` and sets
//      `questionnaireCompleted` so we don't re-prompt.
//
// Backward-compat migration on read: profiles created before multi-tutor
// support get `targetLanguage='pt-BR'` and `tutorId='pt-br-natalia'` filled
// in automatically — existing users see no change.

import type { Level } from './scenarios'
import type { LanguageCode, TutorId } from './tutors/types'
import { DEFAULT_TUTOR_ID, getTutor } from './tutors'

const STORAGE_KEY = 'walkie_profile_v1'

/** Native languages we currently let users pick from. English-only for now. */
export type NativeLanguage = 'English'
export const NATIVE_LANGUAGES: NativeLanguage[] = ['English']

export type LearnerProfile = {
  name?: string
  level?: Level
  /** Native language (enum). Captured in the initial onboarding. */
  nativeLanguage?: NativeLanguage
  /** Goal text, free-form. Captured in the post-subscribe questionnaire. */
  goals?: string
  /** True once the user submits the post-subscribe questionnaire. */
  questionnaireCompleted?: boolean
  /** Target language being learned. Set in the initial onboarding. */
  targetLanguage?: LanguageCode
  /** Specific tutor (language + region + persona). Set in the initial onboarding. */
  tutorId?: TutorId
}

function isLevel(v: unknown): v is Level {
  return (
    v === 'complete-beginner' ||
    v === 'novice' ||
    v === 'intermediate' ||
    v === 'advanced'
  )
}

function isNativeLanguage(v: unknown): v is NativeLanguage {
  return NATIVE_LANGUAGES.includes(v as NativeLanguage)
}

export function loadProfile(): LearnerProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    // Tolerate the legacy free-text nativeLanguage shape from before the
    // enum migration. Anything other than "English" we drop quietly — user
    // can reset it from Settings if/when other natives ship.
    const parsed = JSON.parse(raw) as Omit<
      Partial<LearnerProfile>,
      'nativeLanguage'
    > & {
      nativeLanguage?: unknown
    }
    const profile: LearnerProfile = {}
    if (typeof parsed.name === 'string' && parsed.name.trim()) {
      profile.name = parsed.name.trim()
    }
    if (isLevel(parsed.level)) profile.level = parsed.level
    if (isNativeLanguage(parsed.nativeLanguage)) {
      profile.nativeLanguage = parsed.nativeLanguage
    } else if (
      typeof parsed.nativeLanguage === 'string' &&
      parsed.nativeLanguage.trim().toLowerCase() === 'english'
    ) {
      // Legacy "English" free-text → enum.
      profile.nativeLanguage = 'English'
    }
    if (typeof parsed.goals === 'string' && parsed.goals.trim()) {
      profile.goals = parsed.goals.trim()
    }
    if (parsed.questionnaireCompleted === true) {
      profile.questionnaireCompleted = true
    }

    // Multi-tutor backfill. Any profile that pre-dates multi-tutor support
    // gets routed to Natalia (the original tutor). New users will overwrite
    // these via the initial onboarding picker before their first session.
    if (typeof parsed.targetLanguage === 'string' && parsed.targetLanguage.length > 0) {
      profile.targetLanguage = parsed.targetLanguage as LanguageCode
    } else if (Object.keys(profile).length > 0) {
      profile.targetLanguage = 'pt-BR'
    }
    if (typeof parsed.tutorId === 'string' && parsed.tutorId.length > 0) {
      profile.tutorId = parsed.tutorId
    } else if (profile.targetLanguage) {
      profile.tutorId = DEFAULT_TUTOR_ID
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
  if (!merged.nativeLanguage && isNativeLanguage(updates.nativeLanguage)) {
    merged.nativeLanguage = updates.nativeLanguage
  }
  if (!merged.goals && updates.goals?.trim()) merged.goals = updates.goals.trim()
  if (updates.questionnaireCompleted === true) merged.questionnaireCompleted = true
  if (!merged.targetLanguage && updates.targetLanguage) {
    merged.targetLanguage = updates.targetLanguage
  }
  if (!merged.tutorId && updates.tutorId) merged.tutorId = updates.tutorId
  saveProfile(merged)
  return merged
}

/** True if we've completed the post-subscribe questionnaire. */
export function hasFullProfile(profile: LearnerProfile | null): boolean {
  return !!profile?.questionnaireCompleted
}

/** True if the learner has set their language preferences (initial onboarding). */
export function hasLanguageSelection(profile: LearnerProfile | null): boolean {
  return !!profile?.targetLanguage && !!profile?.tutorId
}

/**
 * Renders the learner's profile as a prompt block for the tutor. Returns an
 * empty string if there's nothing useful to say.
 *
 * The goal field is the most important part here: it's the *angle* the
 * learner is approaching the language from (in-laws, travel, work, etc.) and
 * the tutor should weave it into topic choices and follow-up questions.
 */
export function buildLearnerContextBlock(
  profile: LearnerProfile | null,
): string {
  if (!profile) return ''
  const lines: string[] = []
  if (profile.name?.trim()) lines.push(`- Name: ${profile.name.trim()}`)
  if (profile.nativeLanguage) {
    lines.push(`- Native language: ${profile.nativeLanguage}`)
  }
  if (profile.tutorId) {
    const tutor = getTutor(profile.tutorId)
    lines.push(`- Learning: ${tutor.languageLabel} (${tutor.city})`)
  }
  if (profile.level) {
    const levelLabel: Record<string, string> = {
      'complete-beginner': 'First timer (knows zero of the target language)',
      novice: 'Basic (knows a little — greetings, a few words)',
      intermediate: 'Intermediate (can hold a basic conversation)',
      advanced: 'Advanced (fluent-ish)',
    }
    lines.push(`- Self-described level: ${levelLabel[profile.level] ?? profile.level}`)
  }
  if (profile.goals?.trim()) {
    lines.push(`- Why they're learning: ${profile.goals.trim()}`)
  }
  if (lines.length === 0) return ''
  return `LEARNER CONTEXT
${lines.join('\n')}`
}

export function clearProfile(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
