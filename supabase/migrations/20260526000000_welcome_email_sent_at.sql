-- One-time welcome email for new paying subscribers (web Stripe +
-- iOS Apple IAP). lib/email.ts uses this column to dedupe — set the
-- first time a webhook lands the user in an active subscription state,
-- skipped on every event after.
--
-- Nullable timestamptz: NULL means we have NOT sent yet. Setting it
-- to NOW() at send time gives us audit value (we can answer "when did
-- this user get their welcome?") for free.

alter table public.profiles
  add column if not exists welcome_email_sent_at timestamptz null;

comment on column public.profiles.welcome_email_sent_at is
  'When we sent the new-subscriber welcome email. NULL = not sent yet. Single-use dedupe key for lib/email.ts:maybeSendWelcomeEmail.';
