import Stripe from 'stripe'
import { supabaseAdmin } from './supabase-admin.js'
import { maybeSendWelcomeEmail } from './email.js'
import type { HandlerResult } from './api-handlers.js'

type ProductId = 'monthly' | 'yearly'
type SubStatus =
  | 'active'
  | 'trialing'
  | 'in_grace_period'
  | 'on_hold'
  | 'canceled'
  | 'expired'
  | 'past_due'

type SubscriptionRow = {
  user_id: string
  source: 'stripe'
  external_id: string
  product_id: ProductId
  status: SubStatus
  current_period_end: string | null
  cancel_at_period_end: boolean
}

function productFromSubscription(sub: Stripe.Subscription): ProductId | null {
  const interval = sub.items.data[0]?.price.recurring?.interval
  if (interval === 'year') return 'yearly'
  if (interval === 'month') return 'monthly'
  return null
}

function statusFromStripe(stripeStatus: Stripe.Subscription.Status): SubStatus {
  switch (stripeStatus) {
    case 'active':
      return 'active'
    case 'trialing':
      return 'trialing'
    case 'past_due':
    case 'incomplete':
    case 'unpaid':
      return 'past_due'
    case 'incomplete_expired':
      return 'expired'
    case 'paused':
      return 'on_hold'
    case 'canceled':
      return 'canceled'
    default:
      return 'canceled'
  }
}

/// In Stripe API v2025-09-30 and later, `current_period_end` moved from the
/// subscription object onto each subscription item — single-item plans
/// (which is our entire product surface today) carry the same value, but the
/// field is gone from the parent. We read the item first, fall back to the
/// deprecated top-level for older API versions and replayed legacy events.
function periodEndIso(sub: Stripe.Subscription): string | null {
  const item = sub.items?.data?.[0] as
    | (Stripe.SubscriptionItem & { current_period_end?: number })
    | undefined
  const itemEnd = item?.current_period_end
  if (typeof itemEnd === 'number') {
    return new Date(itemEnd * 1000).toISOString()
  }
  const legacyEnd = (sub as Stripe.Subscription & { current_period_end?: number })
    .current_period_end
  return typeof legacyEnd === 'number'
    ? new Date(legacyEnd * 1000).toISOString()
    : null
}

function customerIdOf(
  c: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
): string | null {
  if (!c) return null
  return typeof c === 'string' ? c : c.id
}

async function ensureProfile(opts: {
  userId: string
  stripeCustomerId: string | null
  email: string | null
}): Promise<void> {
  const payload: Record<string, unknown> = { user_id: opts.userId }
  if (opts.stripeCustomerId) payload.stripe_customer_id = opts.stripeCustomerId
  if (opts.email) payload.email = opts.email
  const { error } = await supabaseAdmin()
    .from('profiles')
    .upsert(payload, { onConflict: 'user_id' })
  if (error) throw error
}

async function upsertSubscription(row: SubscriptionRow): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('subscriptions')
    .upsert(row, { onConflict: 'source,external_id' })
  if (error) throw error
}

async function syncFromSubscription(
  stripe: Stripe,
  sub: Stripe.Subscription,
  fallbackUserId?: string,
): Promise<void> {
  const userId =
    (sub.metadata?.user_id as string | undefined) ?? fallbackUserId
  if (!userId) return
  const productId = productFromSubscription(sub)
  if (!productId) return
  const customerId = customerIdOf(sub.customer)
  let email: string | null = null
  if (customerId) {
    try {
      const customer = await stripe.customers.retrieve(customerId)
      if (!customer.deleted) {
        email = (customer.email as string | null) ?? null
      }
    } catch {
      // Best-effort — webhook still ack'd if email fetch fails.
    }
  }
  await ensureProfile({
    userId,
    stripeCustomerId: customerId,
    email,
  })
  const status = statusFromStripe(sub.status)
  await upsertSubscription({
    user_id: userId,
    source: 'stripe',
    external_id: sub.id,
    product_id: productId,
    status,
    current_period_end: periodEndIso(sub),
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
  })

  // Welcome email — fire on the first sync that lands the user in an
  // active state. maybeSendWelcomeEmail is idempotent (dedupes via
  // profiles.welcome_email_sent_at) so re-fires on later subscription
  // events are no-ops.
  if (status === 'active') {
    await maybeSendWelcomeEmail({ userId, plan: productId, emailHint: email })
  }
}

async function processEvent(stripe: Stripe, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId =
        (session.metadata?.user_id as string | undefined) ??
        session.client_reference_id ??
        undefined
      if (!userId) return
      const subId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id
      if (!subId) return
      const sub = await stripe.subscriptions.retrieve(subId)
      await syncFromSubscription(stripe, sub, userId)
      break
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.created': {
      const sub = event.data.object as Stripe.Subscription
      await syncFromSubscription(stripe, sub)
      break
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice & {
        subscription?: string | Stripe.Subscription
      }
      const subId =
        typeof invoice.subscription === 'string'
          ? invoice.subscription
          : invoice.subscription?.id
      if (!subId) return
      const sub = await stripe.subscriptions.retrieve(subId)
      await syncFromSubscription(stripe, sub)
      break
    }
    // Other event types — ack with 200, no-op.
  }
}

export async function handleStripeWebhook(opts: {
  rawBody: Buffer | string
  signature: string | string[] | undefined
  stripeSecret: string | undefined
  webhookSecret: string | undefined
}): Promise<HandlerResult> {
  if (!opts.stripeSecret || !opts.webhookSecret) {
    return {
      status: 500,
      body: {
        error:
          'Stripe not configured. Need STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.',
      },
    }
  }
  const sig = Array.isArray(opts.signature) ? opts.signature[0] : opts.signature
  if (!sig) {
    return { status: 400, body: { error: 'Missing Stripe-Signature header.' } }
  }
  const stripe = new Stripe(opts.stripeSecret)
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(opts.rawBody, sig, opts.webhookSecret)
  } catch (err) {
    return {
      status: 400,
      body: { error: `Signature verification failed: ${String(err)}` },
    }
  }
  try {
    await processEvent(stripe, event)
  } catch (err) {
    return { status: 500, body: { error: String(err) } }
  }
  return { status: 200, body: { received: true, type: event.type } }
}
