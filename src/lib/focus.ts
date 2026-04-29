// Persistent "next-session focus" — a one-line steering hint extracted by
// the post-session review. The tutor uses it silently to bias topic and
// form choices in the next free conversation. NOT shown to the learner;
// not announced as a lesson plan.
//
// Scoped per tutor — focus from a PT session shouldn't leak into ES.

import type { TutorId } from './tutors/types'
import { DEFAULT_TUTOR_ID } from './tutors'

const LEGACY_KEY = 'walkie_focus_v1'
const MAX_LENGTH = 200

function storageKey(tutorId: TutorId): string {
  return `walkie_focus_v2_${tutorId}`
}

function migrateLegacyIfNeeded(): void {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return
    const targetKey = storageKey(DEFAULT_TUTOR_ID)
    if (!localStorage.getItem(targetKey)) {
      localStorage.setItem(targetKey, raw)
    }
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    // ignore
  }
}

export function loadFocus(tutorId: TutorId): string | null {
  migrateLegacyIfNeeded()
  try {
    const raw = localStorage.getItem(storageKey(tutorId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'string') return null
    const trimmed = parsed.trim()
    return trimmed.length > 0 ? trimmed : null
  } catch {
    return null
  }
}

export function saveFocus(tutorId: TutorId, focus: string): void {
  const trimmed = focus.trim().slice(0, MAX_LENGTH)
  if (!trimmed) return
  try {
    localStorage.setItem(storageKey(tutorId), JSON.stringify(trimmed))
  } catch {
    // ignore
  }
}

export function clearFocus(tutorId: TutorId): void {
  try {
    localStorage.removeItem(storageKey(tutorId))
  } catch {
    // ignore
  }
}

/**
 * Renders the focus as a prompt block. Returns '' when empty so callers can
 * filter it out of the instructions array.
 */
export function buildFocusBlock(focus: string | null): string {
  if (!focus) return ''
  return `SESSION FOCUS (silent — do not announce)
Steer this conversation toward the focus below WITHOUT telling the learner about it. Don't say "today we'll work on X" — just naturally bias your questions, topics, and language choices to give them more reps on it. If the learner takes the conversation somewhere else they're excited about, follow them — the focus is a nudge, not a cage.
- ${focus}`
}
