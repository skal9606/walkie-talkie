import { supabase } from './supabase'
import { lessonById, lessonPhrases } from './lessons/catalog'

/// A row from public.review_cards. Mirrors the migration.
export type ReviewCard = {
  user_id: string
  language_code: string
  lesson_id: string
  phrase_index: number
  phrase_target: string
  phrase_native: string
  stage: number
  reviews: number
  next_due_at: string
  last_reviewed_at: string | null
  created_at: string
}

/// SM-2-lite intervals (in days) keyed by stage. Stage advances on
/// "got it", stays on "almost", retreats on "show again". The "show
/// again" path uses a sub-day interval instead of the table.
const STAGE_INTERVAL_DAYS = [1, 3, 7, 14, 30, 60]
const SHOW_AGAIN_HOURS = 4

export type Grade = 'got-it' | 'almost' | 'show-again'

/// Insert review cards for every phrase in a freshly-completed lesson,
/// skipping any phrases already in the deck for this user/language/lesson.
/// Called from the lesson-completion path (Tutor.tsx) immediately after
/// markLessonAttempt returns 'completed'.
///
/// Idempotent: a second call for the same lesson is a no-op because the
/// primary key prevents duplicates and we use insert (not upsert) — we
/// don't want to reset a card the learner has already advanced.
export async function seedDeckForCompletedLesson(
  userId: string,
  languageCode: string,
  lessonId: string,
): Promise<void> {
  const lesson = lessonById(lessonId)
  if (!lesson) return
  const phrases = lessonPhrases(lesson, languageCode)
  if (phrases.length === 0) return

  const rows = phrases.map((p, i) => ({
    user_id: userId,
    language_code: languageCode,
    lesson_id: lessonId,
    phrase_index: i,
    phrase_target: p.target,
    phrase_native: p.native,
    stage: 0,
    reviews: 0,
    next_due_at: new Date().toISOString(),
  }))

  // ignoreDuplicates so re-completing the same lesson is a no-op rather
  // than resetting cards the learner has already moved up the ladder.
  await supabase
    .from('review_cards')
    .upsert(rows, {
      onConflict: 'user_id,language_code,lesson_id,phrase_index',
      ignoreDuplicates: true,
    })
}

/// Due cards for the current user in this language, oldest-due first.
/// Capped at `limit` so the review session has a finite length.
export async function dueCards(
  userId: string,
  languageCode: string,
  limit = 20,
): Promise<ReviewCard[]> {
  const nowIso = new Date().toISOString()
  const { data } = await supabase
    .from('review_cards')
    .select('*')
    .eq('user_id', userId)
    .eq('language_code', languageCode)
    .lte('next_due_at', nowIso)
    .order('next_due_at', { ascending: true })
    .limit(limit)
  return (data as ReviewCard[] | null) ?? []
}

/// All cards in the deck for this language, newest-created first. Used
/// by the Anki CSV export and the deck overview.
export async function allCards(
  userId: string,
  languageCode: string,
): Promise<ReviewCard[]> {
  const { data } = await supabase
    .from('review_cards')
    .select('*')
    .eq('user_id', userId)
    .eq('language_code', languageCode)
    .order('created_at', { ascending: false })
  return (data as ReviewCard[] | null) ?? []
}

/// Apply a grade to a card. Returns the updated next_due_at + stage so
/// the UI can reflect it without a re-fetch. SM-2-lite logic:
///   got-it     → stage += 1 (capped), schedule by table
///   almost     → stage stays,           schedule by table
///   show-again → stage = max(0, s - 1), schedule SHOW_AGAIN_HOURS out
export async function gradeCard(
  card: ReviewCard,
  grade: Grade,
): Promise<{ nextDueAt: string; stage: number }> {
  let nextStage = card.stage
  let nextDue: Date

  if (grade === 'got-it') {
    nextStage = Math.min(card.stage + 1, STAGE_INTERVAL_DAYS.length - 1)
    nextDue = addDays(new Date(), STAGE_INTERVAL_DAYS[nextStage])
  } else if (grade === 'almost') {
    nextDue = addDays(new Date(), STAGE_INTERVAL_DAYS[card.stage])
  } else {
    nextStage = Math.max(0, card.stage - 1)
    nextDue = addHours(new Date(), SHOW_AGAIN_HOURS)
  }

  const nextDueAt = nextDue.toISOString()
  await supabase
    .from('review_cards')
    .update({
      stage: nextStage,
      reviews: card.reviews + 1,
      last_reviewed_at: new Date().toISOString(),
      next_due_at: nextDueAt,
    })
    .eq('user_id', card.user_id)
    .eq('language_code', card.language_code)
    .eq('lesson_id', card.lesson_id)
    .eq('phrase_index', card.phrase_index)

  return { nextDueAt, stage: nextStage }
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

function addHours(d: Date, n: number): Date {
  const out = new Date(d)
  out.setHours(out.getHours() + n)
  return out
}

/// Convert the user's deck to Anki-compatible CSV (front,back). Anki's
/// default import expects target on the front, native translation on
/// the back. We quote both fields for CSV safety.
export function toAnkiCsv(cards: ReviewCard[]): string {
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`
  const lines = cards.map((c) => `${escape(c.phrase_target)},${escape(c.phrase_native)}`)
  return lines.join('\n')
}
