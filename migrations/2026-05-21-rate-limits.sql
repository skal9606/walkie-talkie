-- Per-user rate limits for the expensive API endpoints. Without this,
-- any authenticated user (incl. an anonymous Supabase account, which we
-- auto-create) can hammer /api/session or /api/translate and burn the
-- project's OpenAI budget — combined with the per-IP trial bypass, that's
-- a real economic DoS.
--
-- The model is a fixed window: count requests in the current window,
-- reject when count > max_count. Window length is per-bucket; the RPC
-- handles both the reset (when the previous window has expired) and the
-- increment in one atomic call.
--
-- Bucket key is `(user_id, bucket)` so the same user can have separate
-- limits for "session" vs "translate" vs future endpoints. Tunables
-- (max + window) live on the call site, not the schema, so we can adjust
-- without a migration.

CREATE TABLE IF NOT EXISTS rate_limits (
  user_id UUID NOT NULL,
  bucket TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, bucket)
);

-- Atomic check + increment. Returns the new count AFTER incrementing.
-- Caller compares against max_count and rejects if it exceeds.
--
-- Implementation detail: if the current window is older than
-- window_seconds, reset window_start to now() and count to 1.
-- Otherwise just bump count.
CREATE OR REPLACE FUNCTION check_and_bump_rate_limit(
  p_user_id UUID,
  p_bucket TEXT,
  p_window_seconds INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  new_count INTEGER;
BEGIN
  INSERT INTO rate_limits (user_id, bucket, window_start, count)
  VALUES (p_user_id, p_bucket, now(), 1)
  ON CONFLICT (user_id, bucket) DO UPDATE
    SET
      window_start = CASE
        WHEN rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
          THEN now()
        ELSE rate_limits.window_start
      END,
      count = CASE
        WHEN rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
          THEN 1
        ELSE rate_limits.count + 1
      END
  RETURNING count INTO new_count;
  RETURN new_count;
END;
$$;
