-- Per-user counters for the admin dashboard.
--
-- Why these live on `profiles` instead of a `sessions` table:
--   - One row per user, append-only counter — atomic UPDATE is cheap.
--   - We don't need per-session detail for the MVP dashboard (just
--     totals + averages). If/when we want per-session analytics
--     (timestamps, ended_at, abandonment), promote to a sessions table.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS total_practice_seconds INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_conversations INTEGER NOT NULL DEFAULT 0;

-- Atomic +seconds. Called from /api/heartbeat for ALL users (subscribed
-- AND free) — replaces the old "only trial users get tracked" gap that
-- was hiding paid usage from the dashboard. No-op if the profile row
-- doesn't exist yet (the heartbeat path always runs after at least one
-- session mint, so this should be vanishingly rare).
CREATE OR REPLACE FUNCTION increment_practice(
  p_user_id UUID,
  p_seconds INTEGER
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE profiles
    SET total_practice_seconds = total_practice_seconds + p_seconds
    WHERE user_id = p_user_id;
END;
$$;

-- Atomic +1 conversation. Called once per /api/session mint. Inserts a
-- skeleton profile row if none exists, so brand-new anonymous users
-- get counted on their first session even before they finish onboarding.
CREATE OR REPLACE FUNCTION increment_conversations(
  p_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM profiles WHERE user_id = p_user_id) THEN
    UPDATE profiles
      SET total_conversations = total_conversations + 1
      WHERE user_id = p_user_id;
  ELSE
    INSERT INTO profiles (user_id, total_conversations)
    VALUES (p_user_id, 1);
  END IF;
END;
$$;
