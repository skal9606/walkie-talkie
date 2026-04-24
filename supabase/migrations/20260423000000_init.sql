-- Walkie Talkie initial schema.
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query),
-- or via the Supabase CLI: `supabase db push`.

-- ============================================================================
-- subscriptions — one row per user, mirrors Stripe subscription state
-- ============================================================================

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'inactive',
    -- 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | 'inactive'
  plan text,
    -- 'monthly' | 'yearly' | null
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_customer_idx
  on public.subscriptions(stripe_customer_id);

-- ============================================================================
-- usage — server-side free-minute tracking (one row per user)
-- ============================================================================

create table if not exists public.usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  seconds_used integer not null default 0,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- updated_at auto-update
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

drop trigger if exists usage_set_updated_at on public.usage;
create trigger usage_set_updated_at
  before update on public.usage
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Row-level security
-- Users can READ their own rows; all WRITES go through serverless functions
-- using the service_role key, which bypasses RLS. This prevents users from
-- flipping their own subscription status or resetting their free-minute count
-- from the browser.
-- ============================================================================

alter table public.subscriptions enable row level security;
alter table public.usage enable row level security;

drop policy if exists "Users read own subscription" on public.subscriptions;
create policy "Users read own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "Users read own usage" on public.usage;
create policy "Users read own usage"
  on public.usage for select
  using (auth.uid() = user_id);

-- ============================================================================
-- Atomic usage increment. Called from serverless functions via service_role.
-- Creates the row if it doesn't exist yet, otherwise adds to existing total.
-- ============================================================================

create or replace function public.increment_usage(
  p_user_id uuid,
  p_seconds integer
)
returns integer
language plpgsql
security definer
as $$
declare
  new_total integer;
begin
  insert into public.usage (user_id, seconds_used)
  values (p_user_id, greatest(p_seconds, 0))
  on conflict (user_id) do update
    set seconds_used = public.usage.seconds_used + greatest(p_seconds, 0)
  returning seconds_used into new_total;
  return new_total;
end;
$$;
