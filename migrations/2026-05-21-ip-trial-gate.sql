-- Per-IP trial gating. Prevents a user from cycling through new
-- anonymous Supabase accounts on the same device to repeatedly get
-- a fresh 10-minute trial.
--
-- We hash the IP (SHA-256) before storing so the raw IP is never
-- persisted — the table just needs equality matching, not the
-- original address.
--
-- Trade-offs to be aware of (will surface in user feedback over time):
--   - Households / shared WiFi: spouse on partner's IP gets denied
--     a fresh trial. They can still subscribe; they can also sign in
--     to their existing account if they had one elsewhere.
--   - VPNs / corporate NAT: many users behind one IP — only the
--     first gets the trial.
--   - Mobile users on cellular: each network switch can change IP.
--     Less abuse-able than expected (each IP gets its own quota).

CREATE TABLE IF NOT EXISTS ip_usage (
  ip_hash TEXT PRIMARY KEY,
  seconds_used INTEGER NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Atomic increment. Mirrors the pattern used by increment_usage for
-- per-user trial seconds. Upserts the row if it doesn't exist yet,
-- otherwise bumps seconds_used and updates last_seen_at.
CREATE OR REPLACE FUNCTION increment_ip_usage(
  p_ip_hash TEXT,
  p_seconds INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  new_total INTEGER;
BEGIN
  INSERT INTO ip_usage (ip_hash, seconds_used, first_seen_at, last_seen_at)
  VALUES (p_ip_hash, p_seconds, now(), now())
  ON CONFLICT (ip_hash) DO UPDATE
    SET seconds_used = ip_usage.seconds_used + p_seconds,
        last_seen_at = now()
  RETURNING seconds_used INTO new_total;
  RETURN new_total;
END;
$$;
