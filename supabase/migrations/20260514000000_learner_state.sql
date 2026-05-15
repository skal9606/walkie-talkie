-- ============================================================================
-- Per-learner state derived from prior sessions: mistakes the tutor should
-- circle back to, personal facts worth remembering, and a freshness-biased
-- "next focus" note. Persisted on the profile so the next session can
-- weave continuity naturally (the tutor doesn't have to re-discover what
-- you keep getting wrong every session).
-- ============================================================================
--
-- Shape (all three columns are language-keyed JSONB):
--
-- recent_mistakes  → { "pt-BR": [{ "original": "...", "corrected": "...",
--                                   "explanation": "...", "recordedAt": "..." }],
--                       "es": [...] }
--
-- recent_memory    → { "pt-BR": ["Has a daughter named Lucy who is 7", ...],
--                       "es": [...] }
--
-- next_focus       → { "pt-BR": "Lean on past tense — they kept defaulting
--                                 to present when describing the weekend",
--                       "es": "..." }
--
-- Language scoping keeps facts shared with one tutor from leaking into
-- another tutor's session — your sister in Salvador is a PT-only fact;
-- talking to María in Spanish about her would feel uncanny.
--
-- Both arrays are application-capped at ~10 entries on write (most recent
-- wins). We don't enforce the cap in the database because writes are
-- already gated through the /api/review handler.

alter table public.profiles
  add column if not exists recent_mistakes jsonb not null default '{}'::jsonb,
  add column if not exists recent_memory   jsonb not null default '{}'::jsonb,
  add column if not exists next_focus      jsonb not null default '{}'::jsonb;
