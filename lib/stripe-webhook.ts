import Stripe from 'stripe'
import { supabaseAdmin } from './supabase-admin'
import type { HandlerResult } from './api-handlers'

type SubscriptionRow = {
  user_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  status: string
  plan: string | null
  current_period_end: string | null
}

function planFromSubscription(sub: Stripe.Subscription): 'monthly' | 'yearly' | null {
  const interval = sub.items.data[0]?.price.recurring?.interval
  if (interval === 'year') return 'yearly'
  if (interval === 'month') return 'monthly'
  return null
}

function periodEndIso(sub: Stripe.Subscription): string | null {
  const end = (sub as Stripe.Subscription & { current_period_end?: number })
    .current_period_end
  return typeof end === 'number' ? new Date(end * 1000).toISOString() : null
}

function customerIdOf(
  c: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
): string | null {
  if (!c) return null
  return typeof c === 'string' ? c : c.id
}

async function upsertSubscription(row: SubscriptionRow): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('subscriptions')
    .upsert(row, { onConflict: 'user_id' })
  if (error) throw error
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
      await upsertSubscription({
        user_id: userId,
        stripe_customer_id: customerIdOf(sub.customer),
        stripe_subscription_id: sub.id,
        status: sub.status,
        plan: planFromSubscription(sub),
        current_period_end: periodEndIso(sub),
      })
      break
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.created': {
      const sub = event.data.object as Stripe.Subscription
      const userId = sub.metadata?.user_id
      if (!userId) return
      await upsertSubscription({
        user_id: userId,
        stripe_customer_id: customerIdOf(sub.customer),
        stripe_subscription_id: sub.id,
        status: sub.status,
        plan: planFromSubscription(sub),
        current_period_end: periodEndIso(sub),
      })
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
      const userId = sub.metadata?.user_id
      if (!userId) return
      await upsertSubscription({
        user_id: userId,
        stripe_customer_id: customerIdOf(sub.customer),
        stripe_subscription_id: sub.id,
        status: 'past_due',
        plan: planFromSubscription(sub),
        current_period_end: periodEndIso(sub),
      })
      break
    }
    // Any other event types we don't care about — just ack with 200.
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
