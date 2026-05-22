-- Track the IP hash of each user's first interaction so the admin
-- dashboard can flag duplicate-IP signups (one person cycling through
-- multiple anonymous accounts on the same device). We store ONLY the
-- SHA-256 hash from lib/gating.ts:clientIpHash — never the raw IP.
--
-- Population: api/heartbeat.ts calls setSignupIpHashIfMissing on every
-- heartbeat, which is a no-op once the column is set. Backfill is
-- intentionally absent — older accounts stay NULL and just don't
-- appear in the duplicate-hash check.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS signup_ip_hash TEXT;

-- Index lets the admin dashboard's "count users per hash" query stay
-- cheap as the user base grows.
CREATE INDEX IF NOT EXISTS profiles_signup_ip_hash_idx
  ON profiles (signup_ip_hash)
  WHERE signup_ip_hash IS NOT NULL;
