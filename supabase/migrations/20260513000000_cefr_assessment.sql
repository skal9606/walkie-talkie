-- ============================================================================
-- CEFR (Common European Framework of Reference for Languages) assessment
-- ============================================================================
-- Stored on the profile so it survives across sessions and can be re-read
-- on paywall render without re-running the LLM grader. Per-user — we keep
-- the most recent assessment plus the language it was for. Switching the
-- target language doesn't clear the old assessment (still informative if
-- the learner switches back), but the paywall only displays it when the
-- stored cefr_language matches the active tutor's language.
--
-- Levels are strings rather than an enum so we can add intermediates
-- (e.g. "B1+", "INSUFFICIENT_DATA") without a follow-up migration.

alter table public.profiles
  add column if not exists cefr_level text,
  add column if not exists cefr_language text,
  add column if not exists cefr_note text,
  add column if not exists cefr_assessed_at timestamptz;
