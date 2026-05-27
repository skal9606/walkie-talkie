-- Walkie Talkie: per-device trial gating.
--
-- Third leg of the trial-abuse defense, alongside per-user (usage table)
-- and per-IP (ip_usage table). Covers the case the other two miss:
-- delete the iOS app → reinstall → sign in with a new account → fresh
-- 10 minutes. The per-user cap doesn't see across accounts and the
-- per-IP cap breaks the moment the abuser switches off wifi.
--
-- iOS clients send a UUID persisted in their Keychain
-- (DeviceTrialId.swift) as the X-Walkie-Device-Id header on /api/session
-- and /api/heartbeat. iOS Keychain items survive app uninstall, so the
-- same UUID is read back after a fresh install — and the server gates
-- on it the same way it gates on user_id + ip_hash.
--
-- Web has no equivalent (no Keychain in browsers); web traffic just
-- skips the device gate and is protected by the user + IP caps.

-- ============================================================================
-- device_usage — per-device trial-seconds bucket
-- ============================================================================

create table if not exists public.device_usage (
  device_id text primary key,
  seconds_used integer not null default 0,
  updated_at timestamptz not null default now()
);

drop trigger if exists device_usage_set_updated_at on public.device_usage;
create trigger device_usage_set_updated_at
  before update on public.device_usage
  for each row execute function public.set_updated_at();

-- RLS on for parity with usage / ip_usage / subscriptions. No SELECT
-- policy is added intentionally — device_id is not joinable to a user
-- row, so there's no coherent "own rows" predicate. All access is via
-- service_role from the serverless functions.
alter table public.device_usage enable row level security;

-- ============================================================================
-- Atomic per-device increment. Mirrors increment_ip_usage(text, integer).
-- ============================================================================

create or replace function public.increment_device_usage(
  p_device_id text,
  p_seconds integer
)
returns integer
language plpgsql
security definer
as $$
declare
  new_total integer;
begin
  insert into public.device_usage (device_id, seconds_used)
  values (p_device_id, greatest(p_seconds, 0))
  on conflict (device_id) do update
    set seconds_used = public.device_usage.seconds_used + greatest(p_seconds, 0)
  returning seconds_used into new_total;
  return new_total;
end;
$$;

-- Same lockdown as increment_usage + increment_ip_usage — only
-- service_role may call this. Without these revokes, any signed-in
-- user could call
-- supabase.rpc('increment_device_usage', { p_device_id: '<any>', p_seconds: 999999 })
-- and exhaust another device's trial budget.
revoke execute on function public.increment_device_usage(text, integer) from public;
revoke execute on function public.increment_device_usage(text, integer) from anon;
revoke execute on function public.increment_device_usage(text, integer) from authenticated;
