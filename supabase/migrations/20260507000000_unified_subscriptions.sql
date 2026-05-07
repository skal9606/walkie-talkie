-- Unified subscriptions: replace the Stripe-only model with a source-agnostic
-- one that handles Stripe (web) and Apple IAP (iOS) under the same schema.
--
-- This migration is destructive: it drops the existing public.subscriptions
-- table. Only safe to run because the existing rows are dev-only test data.
-- For a fully clean slate also wipe auth.users from the Supabase dashboard
-- (Auth → Users → select all → Delete).

-- ============================================================================
-- profiles — extends auth.users with stable identifiers we need to look up
-- a user from each payment source's webhook payloads.
-- ============================================================================

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  stripe_customer_id text unique,
  apple_user_id text unique,
    -- The stable Sign In with Apple `sub` (subject) claim. Survives across
    -- reinstalls and devices, so an iOS user who reinstalls can recover
    -- their subscription.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- subscriptions — one row per (source, external_id) pair. A single user can
-- have at most one Stripe sub AND one Apple sub (edge case if they pay on
-- both platforms); the app treats them as subscribed if either is active.
-- ============================================================================

drop table if exists public.subscriptions cascade;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('stripe', 'apple')),
  external_id text not null,
    -- Stripe: subscription id (sub_xxx).
    -- Apple: originalTransactionId — stable across renewals, identifies the
    -- subscription lineage. NOT the per-renewal transaction id.
  product_id text not null check (product_id in ('monthly', 'yearly')),
  status text not null check (status in (
    'active',
    'trialing',
    'in_grace_period',
    'on_hold',
    'canceled',
    'expired',
    'past_due'
  )),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id)
);

create index subscriptions_user_idx on public.subscriptions(user_id);

-- Partial index for the hot-path query: "is this user currently subscribed?"
create index subscriptions_active_idx
  on public.subscriptions(user_id)
  where status in ('active', 'trialing', 'in_grace_period');

-- ============================================================================
-- updated_at triggers
-- ============================================================================

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Row-level security
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;

-- Profiles: user can read + update their own row. Inserts go through a
-- serverless function on first sign-in (service_role bypasses RLS).
drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = user_id);

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Subscriptions: read-only for the user. All writes via service_role from
-- Stripe / Apple webhooks. Users must not be able to flip their own status.
drop policy if exists "Users read own subscriptions" on public.subscriptions;
create policy "Users read own subscriptions"
  on public.subscriptions for select
  using (auth.uid() = user_id);
