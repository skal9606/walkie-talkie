-- Walkie Talkie: per-IP trial gating + signup IP fingerprint.
--
-- The application code in lib/gating.ts has referenced this schema since
-- 2026-05-21 (clientIpHash, addIpUsageSeconds, setSignupIpHashIfMissing,
-- ip_usage joins in checkSessionAccess). The matching DDL was applied to
-- prod via the Supabase SQL editor at the time but never committed to the
-- repo, so dev/preview environments diverged silently and any future
-- `supabase db reset` would drop it. This migration brings the schema
-- back under version control. Idempotent — safe to apply to a database
-- that already has it.
--
-- What it protects against: the "cycle anonymous accounts on the same
-- device to refresh the 10-minute trial" loop. The per-user cap alone
-- doesn't see across accounts; pairing it with a per-IP cap closes the
-- gap. Both caps apply — effective remaining = FREE_TIER_SECONDS minus
-- max(user_used, ip_used).

-- ============================================================================
-- ip_usage — per-hashed-IP trial-seconds bucket
-- ============================================================================

create table if not exists public.ip_usage (
  ip_hash text primary key,
  seconds_used integer not null default 0,
  updated_at timestamptz not null default now()
);

drop trigger if exists ip_usage_set_updated_at on public.ip_usage;
create trigger ip_usage_set_updated_at
  before update on public.ip_usage
  for each row execute function public.set_updated_at();

-- RLS on for parity with usage / subscriptions. No SELECT policy is added
-- intentionally — ip_hash is not joinable to a user row, so there's no
-- coherent "own rows" predicate. All access is via service_role from the
-- serverless functions.
alter table public.ip_usage enable row level security;

-- ============================================================================
-- Atomic per-IP increment. Mirrors increment_usage(uuid, integer) but
-- keyed on the SHA-256 hex digest of the client IP (computed in
-- lib/gating.ts so the raw address never reaches the DB).
-- ============================================================================

create or replace function public.increment_ip_usage(
  p_ip_hash text,
  p_seconds integer
)
returns integer
language plpgsql
security definer
as $$
declare
  new_total integer;
begin
  insert into public.ip_usage (ip_hash, seconds_used)
  values (p_ip_hash, greatest(p_seconds, 0))
  on conflict (ip_hash) do update
    set seconds_used = public.ip_usage.seconds_used + greatest(p_seconds, 0)
  returning seconds_used into new_total;
  return new_total;
end;
$$;

-- Same lockdown as increment_usage — only service_role may call this.
-- Without these revokes, any signed-in user could call
-- supabase.rpc('increment_ip_usage', { p_ip_hash: '<any>', p_seconds: 999999 })
-- and exhaust another household's trial budget.
revoke execute on function public.increment_ip_usage(text, integer) from public;
revoke execute on function public.increment_ip_usage(text, integer) from anon;
revoke execute on function public.increment_ip_usage(text, integer) from authenticated;

-- ============================================================================
-- profiles.signup_ip_hash — first-heartbeat IP fingerprint
-- Used by the admin dashboard to spot sock-puppet signups (multiple
-- accounts from one IP). Written only on the very first heartbeat (the
-- code uses WHERE signup_ip_hash IS NULL) so a user's recorded signup
-- IP doesn't shift as they move between networks.
-- ============================================================================

alter table public.profiles
  add column if not exists signup_ip_hash text null;
