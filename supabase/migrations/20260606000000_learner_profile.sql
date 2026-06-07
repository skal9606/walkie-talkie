-- ============================================================================
-- Server-side learner profile (account is the source of truth, not the browser)
-- ============================================================================
-- "Has the user completed onboarding?" was previously decided from the
-- browser's localStorage (walkie_profile_v1). A logged-in user who already
-- onboarded got forced through onboarding again on a fresh browser / different
-- device / after sign-out (which wipes localStorage as a security feature).
--
-- These columns persist the learner profile keyed by the existing user_id so
-- the decision can be account-based. They mirror the client-side
-- LearnerProfile shape (src/lib/profile.ts). Distinct names from the existing
-- cefr_* columns to avoid collisions. All nullable; existing columns untouched.
--
-- Population: api/subscription-status.ts reads these on app load (returned to
-- the client so onboarding can be skipped for returning users); api/heartbeat.ts
-- upserts them when the client sends a `profile` payload (e.g. right after the
-- initial onboarding completes). See lib/api-handlers.ts:upsertLearnerProfile /
-- loadLearnerProfile.

alter table public.profiles
  add column if not exists learner_name text,
  add column if not exists native_language text,
  add column if not exists target_language text,
  add column if not exists tutor_id text,
  add column if not exists self_level text,
  add column if not exists goals text,
  add column if not exists questionnaire_completed boolean default false;

comment on column public.profiles.target_language is
  'Learner-selected target language (e.g. ''pt-BR''). Source of truth for onboarding completion together with tutor_id. Set by lib/api-handlers.ts:upsertLearnerProfile.';
