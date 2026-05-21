-- Add server-side streak fields to profiles. Single source of truth for
-- the daily-practice streak shown on iOS home + web home + Stats. Replaces
-- the previous device-local implementations (iOS SwiftData, web localStorage)
-- which couldn't sync across devices.
--
-- streak_count: current run of consecutive days with a 60s+ conversation.
-- streak_last_day: YYYY-MM-DD in the LEARNER's local timezone (client-
--   supplied — server is timezone-agnostic). NULL = never had a streak.
--
-- Display rule (computed client-side, no extra query):
--   today or yesterday → show streak_count
--   anything older     → broken, show 0

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS streak_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_last_day DATE;
