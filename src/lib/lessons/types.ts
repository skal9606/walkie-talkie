// Type definitions for the lessons feature. Mirrors the iOS app's
// Lesson.swift exactly so a learner who completes "ft-2-1" on iOS
// won't be re-prompted on web. Catalogue metadata lives in catalog.ts,
// per-language phrase content lives in content/<lang>.ts.

export type LessonLevel = 'first_timer' | 'basic' | 'intermediate' | 'advanced'

export const LESSON_LEVELS: LessonLevel[] = ['first_timer', 'basic', 'intermediate', 'advanced']

export function lessonLevelDisplayName(level: LessonLevel): string {
  switch (level) {
    case 'first_timer':
      return 'First Timer'
    case 'basic':
      return 'Basic'
    case 'intermediate':
      return 'Intermediate'
    case 'advanced':
      return 'Advanced'
  }
}

/** Ordering for "above/below" comparisons on the All Levels screen. */
export function lessonLevelOrder(level: LessonLevel): number {
  switch (level) {
    case 'first_timer':
      return 0
    case 'basic':
      return 1
    case 'intermediate':
      return 2
    case 'advanced':
      return 3
  }
}

export type LessonState = 'completed' | 'in_progress' | 'not_started' | 'locked'

/** Persisted-only states. View code may project to LessonState (+ locked). */
export type LessonProgressState = 'not_started' | 'in_progress' | 'completed'

export type LessonPhrase = {
  /** Phrase in the target language. */
  target: string
  /** Translation in the learner's native language (English for now). */
  native: string
}

/** Lesson metadata. Phrases live per-language — see `phrases(lesson, lang)`. */
export type Lesson = {
  id: string
  emoji: string
  title: string
  /** Pre-formatted e.g. "Learn 5 phrases · 8 min". */
  summary: string
  /** Role-play scene the tutor sets at the start of the session.
   *  Written in English; the multilingual model takes it as guidance
   *  regardless of target language. */
  scene: string
}

export type LessonUnit = {
  id: string
  title: string
  lessons: Lesson[]
}
