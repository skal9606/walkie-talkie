-- ============================================================================
-- Spaced-repetition review deck. One row per (user, language, lesson, phrase
-- index). Auto-populated client-side after a lesson is marked completed; the
-- /review surface reads due rows (next_due_at <= now) and lets the learner
-- self-grade (-1 / 0 / +1), advancing or retreating the stage on the SM-2-lite
-- ladder. Top praise for ISSEN was "the app remembers what I struggle with";
-- making the lesson phrases part of an ongoing review loop is the same idea
-- applied to vocab/phrase retention, not just live corrections.
-- ============================================================================
--
-- Stage → interval map (applied in the client, not enforced in DB):
--   0  → 1 day      (brand new; needs reinforcement)
--   1  → 3 days
--   2  → 7 days
--   3  → 14 days
--   4  → 30 days
--   5+ → 60 days    (cap; rare card barely seen)
-- "Show again" demotes stage and re-shows after ~4 hours.
--
-- phrase_target / phrase_native are denormalized snapshots so the review
-- surface doesn't need to re-walk the lesson catalog (and so old reviews
-- keep working even if the catalog text changes).

create table if not exists public.review_cards (
  user_id          uuid        not null references auth.users on delete cascade,
  language_code    text        not null,
  lesson_id        text        not null,
  phrase_index     integer     not null,
  phrase_target    text        not null,
  phrase_native    text        not null,
  stage            integer     not null default 0,
  reviews          integer     not null default 0,
  next_due_at      timestamptz not null default now(),
  last_reviewed_at timestamptz,
  created_at       timestamptz not null default now(),
  primary key (user_id, language_code, lesson_id, phrase_index)
);

alter table public.review_cards enable row level security;

create policy "review_cards: select own"
  on public.review_cards for select
  using (auth.uid() = user_id);

create policy "review_cards: insert own"
  on public.review_cards for insert
  with check (auth.uid() = user_id);

create policy "review_cards: update own"
  on public.review_cards for update
  using (auth.uid() = user_id);

create policy "review_cards: delete own"
  on public.review_cards for delete
  using (auth.uid() = user_id);

-- Composite index for the hot read: "what's due for this user in this
-- language right now, ordered by due-ness."
create index if not exists review_cards_due_idx
  on public.review_cards (user_id, language_code, next_due_at);
