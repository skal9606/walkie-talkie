-- Record the client platform (ios vs web) of each user's first
-- interaction so the admin dashboard's Recent Signups table can show a
-- real platform column instead of inferring it from sign-in provider.
--
-- Population: api/heartbeat.ts calls setSignupPlatformIfMissing on every
-- heartbeat (parallel to setSignupIpHashIfMissing), which is a no-op once
-- the column is set. The signal is the explicit `x-walkie-platform`
-- header the client sends ('ios' | 'web'); the iOS Keychain device-id
-- header is used as a fallback for older iOS builds. Backfill is
-- intentionally absent — older accounts stay NULL and render as "—".

alter table public.profiles
  add column if not exists signup_platform text null;

comment on column public.profiles.signup_platform is
  'Client platform at first interaction: ''ios'' | ''web''. NULL = unknown (pre-migration accounts or never sent). Set once by lib/gating.ts:setSignupPlatformIfMissing.';
