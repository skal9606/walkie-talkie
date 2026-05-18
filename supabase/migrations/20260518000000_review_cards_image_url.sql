-- ============================================================================
-- Add image_url to review_cards so vocab flashcards can carry a visual
-- alongside the target word — Duolingo-style. Images are sourced from
-- Unsplash (free tier API) and the URL is hotlinked, not downloaded:
--   - Unsplash URLs are permanent, no expiry to manage
--   - Their TOS allows hotlinking; attribution shown in the card UI
-- Nullable because (a) older cards predating this column have none,
-- and (b) verbs / abstract words often don't get a useful image — we
-- skip the lookup rather than store a bad match.
-- ============================================================================

alter table public.review_cards
  add column if not exists image_url text;
