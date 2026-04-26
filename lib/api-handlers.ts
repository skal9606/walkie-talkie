// Shared handlers used by both the Vite dev middleware and the Vercel
// serverless functions under api/. Pure functions — no request/response
// coupling, so each runtime can wrap them however it likes.

export type HandlerResult = {
  status: number
  body: unknown
}

// -- OpenAI Realtime session token ------------------------------------------

export async function mintSessionToken(apiKey: string | undefined): Promise<HandlerResult> {
  if (!apiKey) {
    return {
      status: 500,
      body: {
        error:
          'OPENAI_API_KEY not set. Add it to .env.local (dev) or the deployment environment (prod).',
      },
    }
  }
  try {
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-realtime',
        voice: 'shimmer',
      }),
    })
    const body = await response.json()
    return { status: response.status, body }
  } catch (err) {
    return { status: 500, body: { error: String(err) } }
  }
}

// -- Translate a Portuguese utterance to English ----------------------------

export async function translate(
  apiKey: string | undefined,
  text: string | undefined,
): Promise<HandlerResult> {
  if (!apiKey) {
    return { status: 500, body: { error: 'OPENAI_API_KEY not set.' } }
  }
  const trimmed = (text ?? '').trim()
  if (!trimmed) {
    return { status: 400, body: { error: 'No text provided.' } }
  }
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              "Translate the user's Brazilian Portuguese to natural, conversational English. If parts are already in English, leave them as-is. Return only the translation — no quotes, no explanation, no prefixes.",
          },
          { role: 'user', content: trimmed },
        ],
        max_tokens: 500,
        temperature: 0.2,
      }),
    })
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      error?: { message?: string }
    }
    if (data.error) {
      return { status: 500, body: { error: data.error.message } }
    }
    const translation = data.choices?.[0]?.message?.content?.trim() ?? ''
    return { status: 200, body: { translation } }
  } catch (err) {
    return { status: 500, body: { error: String(err) } }
  }
}

// -- Post-session review ----------------------------------------------------

export type TranscriptEntry = { role: 'user' | 'tutor'; text: string }

export async function reviewTranscript(
  apiKey: string | undefined,
  params: { transcript?: TranscriptEntry[]; scenario?: string },
): Promise<HandlerResult> {
  if (!apiKey) {
    return { status: 500, body: { error: 'OPENAI_API_KEY not set.' } }
  }
  const transcript = params.transcript ?? []
  if (transcript.length === 0) {
    return { status: 400, body: { error: 'Empty transcript.' } }
  }
  try {
    const scenarioLine = params.scenario ? `SCENARIO: ${params.scenario}\n\n` : ''
    const transcriptText = transcript
      .map((t) => `${t.role === 'user' ? 'Learner' : 'Tutor'}: ${t.text}`)
      .join('\n')

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: `You are reviewing a Brazilian Portuguese language-learning conversation between a tutor and an English-speaking learner. Produce a JSON object with these exact keys:

- "summary": string. One or two sentences on what was practiced.
- "corrections": array of { "original": string, "corrected": string, "explanation": string }. Only include meaningful mistakes the learner made — skip tiny slips. Use the learner's exact words for "original". Keep "explanation" brief (one line), in English.
- "newVocabulary": array of { "word": string, "translation": string, "example": string }. Portuguese words/phrases the tutor introduced that are worth reviewing. Use a natural example sentence in Portuguese.
- "practiceNextTime": array of 2-4 short strings suggesting what to focus on next time.
- "memory": array of 2-4 short third-person factual bullets about the LEARNER that would be useful to recall in a future session. Examples: "Has a daughter named Lucy who is 7", "Works as a venture capitalist", "Lives in San Francisco but visits Brazil yearly", "Recently started reading Clarice Lispector". ONLY include facts the learner actually shared (people, places, work, hobbies, life events). Skip language-mechanics observations and anything trivial. Use empty array if the learner shared nothing personal.
- "name": string or null. The learner's first name if they explicitly told the tutor in this session (e.g. "I'm Steve" or "My name is Steve"). DO NOT guess from a transcription artifact. Null if they never said it.
- "inferredLevel": one of "complete-beginner", "novice", "intermediate", "advanced", or null. Your best estimate of their actual proficiency based on what they produced — NOT what they claimed. Use these markers: complete-beginner = no Portuguese produced, only English; novice = a few words/phrases like "olá", "obrigado", numbers; intermediate = full sentences with present + past tense, occasional errors; advanced = fluent and idiomatic. Null if you don't have enough signal.

All seven keys must be present. Use empty arrays / null if there is genuinely nothing to report. Be concise.`,
          },
          { role: 'user', content: scenarioLine + transcriptText },
        ],
      }),
    })
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      error?: { message?: string }
    }
    if (data.error) {
      return { status: 500, body: { error: data.error.message } }
    }
    const content = data.choices?.[0]?.message?.content ?? '{}'
    try {
      return { status: 200, body: JSON.parse(content) }
    } catch {
      return { status: 500, body: { error: 'Invalid JSON from review model.' } }
    }
  } catch (err) {
    return { status: 500, body: { error: String(err) } }
  }
}

// -- Stripe Checkout session -----------------------------------------------

export type StripeEnv = {
  stripeSecretKey?: string
  monthlyPriceId?: string
  yearlyPriceId?: string
}

// Hosts we accept as success/cancel URLs when starting a Stripe checkout.
// Prevents an attacker with a valid JWT from routing a user's post-payment
// redirect (which contains the session_id) to a phishing site.
const ALLOWED_REDIRECT_HOSTS = new Set([
  'walkietalkie.so',
  'www.walkietalkie.so',
  'localhost:5173',
  'localhost:5174',
  'localhost:5175',
])

function isAllowedRedirectUrl(url: string | undefined): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    if (ALLOWED_REDIRECT_HOSTS.has(parsed.host)) return true
    // Vercel preview deploys (e.g. walkie-talkie-abc.vercel.app) are allowed.
    if (parsed.host.endsWith('.vercel.app')) return true
    return false
  } catch {
    return false
  }
}

export async function createCheckoutSession(
  env: StripeEnv,
  params: {
    plan?: string
    successUrl?: string
    cancelUrl?: string
    /** Supabase user id — stored on the Stripe session so the webhook can
     *  link subscription events back to the right user. */
    userId?: string
  },
): Promise<HandlerResult> {
  if (!env.stripeSecretKey) {
    return {
      status: 500,
      body: {
        error:
          'Stripe is not configured. Set STRIPE_SECRET_KEY, STRIPE_MONTHLY_PRICE_ID, and STRIPE_YEARLY_PRICE_ID.',
      },
    }
  }
  const { plan, successUrl, cancelUrl } = params
  if (plan !== 'monthly' && plan !== 'yearly') {
    return { status: 400, body: { error: 'Invalid plan.' } }
  }
  const priceId = plan === 'yearly' ? env.yearlyPriceId : env.monthlyPriceId
  if (!priceId) {
    return {
      status: 500,
      body: { error: `Missing price id for ${plan}.` },
    }
  }
  if (!successUrl || !cancelUrl) {
    return { status: 400, body: { error: 'successUrl and cancelUrl required.' } }
  }
  if (!isAllowedRedirectUrl(successUrl) || !isAllowedRedirectUrl(cancelUrl)) {
    return {
      status: 400,
      body: { error: 'successUrl and cancelUrl must point to an allowed host.' },
    }
  }

  try {
    const form = new URLSearchParams()
    form.set('mode', 'subscription')
    form.set('line_items[0][price]', priceId)
    form.set('line_items[0][quantity]', '1')
    form.set('success_url', successUrl)
    form.set('cancel_url', cancelUrl)
    form.set('allow_promotion_codes', 'true')
    if (params.userId) {
      form.set('client_reference_id', params.userId)
      form.set('metadata[user_id]', params.userId)
      // On the Subscription itself too, so later webhooks (renewal, cancel)
      // still know which user this belongs to.
      form.set('subscription_data[metadata][user_id]', params.userId)
    }

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    })
    const data = (await response.json()) as {
      url?: string
      error?: { message?: string }
    }
    if (!response.ok || !data.url) {
      return {
        status: response.status || 500,
        body: { error: data.error?.message ?? 'Stripe checkout creation failed.' },
      }
    }
    return { status: 200, body: { url: data.url } }
  } catch (err) {
    return { status: 500, body: { error: String(err) } }
  }
}

// -- Subscription detail (settings panel) ---------------------------------

import { supabaseAdmin } from './supabase-admin.js'

export async function getSubscriptionDetail(
  userId: string,
  stripeSecretKey: string | undefined,
): Promise<HandlerResult> {
  const { data: row } = await supabaseAdmin()
    .from('subscriptions')
    .select('status, plan, current_period_end, stripe_subscription_id')
    .eq('user_id', userId)
    .maybeSingle()
  // No row at all = user is on free trial. Return a stable shape.
  if (!row || !row.stripe_subscription_id) {
    return {
      status: 200,
      body: {
        plan: null,
        status: 'trial',
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      },
    }
  }
  // Fetch cancel_at_period_end from Stripe — we don't store it in our DB.
  let cancelAtPeriodEnd = false
  if (stripeSecretKey) {
    try {
      const r = await fetch(
        `https://api.stripe.com/v1/subscriptions/${row.stripe_subscription_id}`,
        { headers: { Authorization: `Bearer ${stripeSecretKey}` } },
      )
      if (r.ok) {
        const sub = (await r.json()) as { cancel_at_period_end?: boolean }
        cancelAtPeriodEnd = sub.cancel_at_period_end ?? false
      }
    } catch {
      // Surface the row anyway; cancelAtPeriodEnd just defaults to false.
    }
  }
  return {
    status: 200,
    body: {
      plan: row.plan,
      status: row.status,
      currentPeriodEnd: row.current_period_end,
      cancelAtPeriodEnd,
    },
  }
}

// -- Cancel subscription (sets cancel_at_period_end on Stripe) ------------

export async function cancelSubscription(
  userId: string,
  stripeSecretKey: string | undefined,
): Promise<HandlerResult> {
  if (!stripeSecretKey) {
    return { status: 500, body: { error: 'Stripe not configured.' } }
  }
  const { data: row } = await supabaseAdmin()
    .from('subscriptions')
    .select('stripe_subscription_id, current_period_end')
    .eq('user_id', userId)
    .maybeSingle()
  if (!row?.stripe_subscription_id) {
    return { status: 400, body: { error: 'No active subscription to cancel.' } }
  }
  // Sets cancel_at_period_end=true. Subscription stays active (and the user
  // keeps full access) until the period naturally ends, at which point Stripe
  // sends customer.subscription.deleted and our webhook flips status to
  // 'canceled'.
  const form = new URLSearchParams()
  form.set('cancel_at_period_end', 'true')
  const r = await fetch(
    `https://api.stripe.com/v1/subscriptions/${row.stripe_subscription_id}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    },
  )
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as {
      error?: { message?: string }
    }
    return {
      status: r.status,
      body: { error: body.error?.message ?? 'Stripe cancellation failed.' },
    }
  }
  return {
    status: 200,
    body: { ok: true, currentPeriodEnd: row.current_period_end },
  }
}

// -- Reactivate subscription (clears cancel_at_period_end on Stripe) ------

export async function reactivateSubscription(
  userId: string,
  stripeSecretKey: string | undefined,
): Promise<HandlerResult> {
  if (!stripeSecretKey) {
    return { status: 500, body: { error: 'Stripe not configured.' } }
  }
  const { data: row } = await supabaseAdmin()
    .from('subscriptions')
    .select('stripe_subscription_id, status')
    .eq('user_id', userId)
    .maybeSingle()
  if (!row?.stripe_subscription_id) {
    return { status: 400, body: { error: 'No subscription to reactivate.' } }
  }
  // Only valid while the subscription is still active in Stripe (i.e. they
  // haven't yet hit currentPeriodEnd). After that the subscription is gone
  // and they'd need a fresh checkout instead.
  if (row.status === 'canceled') {
    return {
      status: 400,
      body: {
        error:
          'Your subscription has already ended. Start a new one from the home screen.',
      },
    }
  }
  const form = new URLSearchParams()
  form.set('cancel_at_period_end', 'false')
  const r = await fetch(
    `https://api.stripe.com/v1/subscriptions/${row.stripe_subscription_id}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    },
  )
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as {
      error?: { message?: string }
    }
    return {
      status: r.status,
      body: { error: body.error?.message ?? 'Stripe reactivation failed.' },
    }
  }
  return { status: 200, body: { ok: true } }
}

// -- Delete account (immediate Stripe cancel + Supabase user delete) ------

export async function deleteAccount(
  userId: string,
  stripeSecretKey: string | undefined,
): Promise<HandlerResult> {
  // Cancel any active subscription IMMEDIATELY (no grace period — they're
  // deleting the account, they don't keep access). This is fire-and-forget:
  // even if Stripe call fails we still proceed with the delete so the user
  // doesn't get stuck.
  if (stripeSecretKey) {
    const { data: row } = await supabaseAdmin()
      .from('subscriptions')
      .select('stripe_subscription_id')
      .eq('user_id', userId)
      .maybeSingle()
    if (row?.stripe_subscription_id) {
      try {
        await fetch(
          `https://api.stripe.com/v1/subscriptions/${row.stripe_subscription_id}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${stripeSecretKey}` },
          },
        )
      } catch {
        // continue with delete regardless
      }
    }
  }
  // Wipe their rows from our tables. Order matters — children first.
  const admin = supabaseAdmin()
  await admin.from('subscriptions').delete().eq('user_id', userId)
  await admin.from('usage').delete().eq('user_id', userId)
  // Finally delete the Supabase auth user. Once this returns, their JWT
  // becomes invalid and refresh-tokens won't issue new ones.
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) {
    return { status: 500, body: { error: error.message } }
  }
  return { status: 200, body: { ok: true } }
}
