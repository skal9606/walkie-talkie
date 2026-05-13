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
        voice: 'coral',
      }),
    })
    const body = await response.json()
    return { status: response.status, body }
  } catch (err) {
    return { status: 500, body: { error: String(err) } }
  }
}

// -- Translate a target-language utterance to English ----------------------

/** Display label shown in the system prompt for each supported language. */
const LANGUAGE_LABELS: Record<string, string> = {
  'pt-BR': 'Brazilian Portuguese',
  'es-MX': 'Mexican Spanish',
  'it-IT': 'Italian',
  'fr-FR': 'French',
  'de-DE': 'German',
  // Future: 'es-ES': 'Castilian Spanish', 'es-AR': 'Rioplatense Spanish', etc.
}

function languageLabel(code: string | undefined): string {
  if (!code) return 'Brazilian Portuguese'
  return LANGUAGE_LABELS[code] ?? code
}

export async function translate(
  apiKey: string | undefined,
  text: string | undefined,
  language?: string,
): Promise<HandlerResult> {
  if (!apiKey) {
    return { status: 500, body: { error: 'OPENAI_API_KEY not set.' } }
  }
  const trimmed = (text ?? '').trim()
  if (!trimmed) {
    return { status: 400, body: { error: 'No text provided.' } }
  }
  const langLabel = languageLabel(language)
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
            content: `Translate the user's ${langLabel} to natural, conversational English. If parts are already in English, leave them as-is. Return only the translation — no quotes, no explanation, no prefixes.`,
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

// -- CEFR assessment --------------------------------------------------------

export type CefrLevel =
  | 'A1'
  | 'A2'
  | 'B1'
  | 'B2'
  | 'C1'
  | 'C2'
  | 'INSUFFICIENT_DATA'

export type CefrAssessment = {
  level: CefrLevel
  /** 1-2 sentence encouraging summary, in English. Shown on the paywall. */
  note: string
  /** Language code that was assessed (e.g. "pt-BR"). */
  language: string
  /** ISO timestamp. */
  assessedAt: string
}

/// Grade a trial conversation against the CEFR rubric. Called from the web
/// client right after the trial timer expires — the result lands on the
/// paywall ("You're at B1 in Spanish") as a personalized hook that
/// outperforms generic conversion copy. INSUFFICIENT_DATA when the learner
/// produced too little target-language speech to assess (e.g. the
/// conversation was entirely in English).
export async function assessCefr(
  apiKey: string | undefined,
  params: {
    transcript?: TranscriptEntry[]
    language?: string
  },
): Promise<HandlerResult> {
  if (!apiKey) {
    return { status: 500, body: { error: 'OPENAI_API_KEY not set.' } }
  }
  const transcript = params.transcript ?? []
  if (transcript.length === 0) {
    return { status: 400, body: { error: 'Empty transcript.' } }
  }
  const languageCode = params.language ?? 'pt-BR'
  const languageName = languageLabel(languageCode)

  const transcriptText = transcript
    .map((t) => `${t.role === 'user' ? 'Learner' : 'Tutor'}: ${t.text}`)
    .join('\n')

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: `You are a CEFR-trained ${languageName} language assessor. Read the transcript and score the LEARNER's spoken ${languageName} against the CEFR rubric. Only judge what the LEARNER said — the Tutor's lines are context.

Evaluate:
- Vocabulary range and accuracy
- Grammar complexity and correctness
- Fluency (turn length, hesitations, connectives)
- Comprehension (responsiveness to the tutor's questions in ${languageName})
- Pragmatic competence (register, idioms, social moves)

CEFR rubric (apply strictly):
- A1: Stock phrases, single words. Only present tense, very limited vocabulary. Greetings, names, numbers.
- A2: Simple sentences about familiar topics. Past/present, basic vocabulary, often mistakes.
- B1: Connected discourse on familiar topics. Opinions, descriptions, past experiences. Errors don't impede comprehension.
- B2: Fluent on most topics. Argues, explains causes, handles abstract subjects, some idiomatic phrasing.
- C1: Effortless, idiomatic. Complex sentences with cohesion devices. Subtle distinctions.
- C2: Near-native. Nuance, irony, register-switching at will.

If the learner produced fewer than 5 turns OR fewer than ~50 words in ${languageName} OR spoke almost entirely in English, return "INSUFFICIENT_DATA".

Return JSON with exactly these keys:
- "level": one of "A1", "A2", "B1", "B2", "C1", "C2", "INSUFFICIENT_DATA"
- "note": 1-2 sentences in ENGLISH. Frame ENCOURAGINGLY — mention one specific strength AND a concrete thing to push toward the next level. Never use words like "poor", "weak", "lacking". For INSUFFICIENT_DATA: invite them to come back for a longer chat.

Examples:
- "level": "A2", "note": "You handled greetings and past tense — push toward longer sentences and 'porque' to start hitting B1."
- "level": "B2", "note": "Strong fluency and you used 'embora' naturally — work on subjunctive in hypotheticals to reach C1."
- "level": "INSUFFICIENT_DATA", "note": "Stick around for a longer chat next time so we can place your level — even 5 minutes of speaking will do it."`,
          },
          { role: 'user', content: transcriptText },
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
    let parsed: { level?: string; note?: string }
    try {
      parsed = JSON.parse(content)
    } catch {
      return { status: 500, body: { error: 'Invalid JSON from CEFR model.' } }
    }
    const validLevels = new Set<CefrLevel>([
      'A1',
      'A2',
      'B1',
      'B2',
      'C1',
      'C2',
      'INSUFFICIENT_DATA',
    ])
    const level = (parsed.level ?? '') as CefrLevel
    if (!validLevels.has(level)) {
      return {
        status: 500,
        body: { error: `Model returned unknown level: ${parsed.level}` },
      }
    }
    const assessment: CefrAssessment = {
      level,
      note: (parsed.note ?? '').trim(),
      language: languageCode,
      assessedAt: new Date().toISOString(),
    }
    return { status: 200, body: assessment }
  } catch (err) {
    return { status: 500, body: { error: String(err) } }
  }
}

/// Persist a fresh assessment to the user's profile. Best-effort — if the
/// upsert fails we still return the assessment to the caller so the
/// paywall can render it, but the result won't survive a page reload.
export async function persistCefrAssessment(
  userId: string,
  assessment: CefrAssessment,
): Promise<void> {
  const { supabaseAdmin } = await import('./supabase-admin.js')
  const { error } = await supabaseAdmin()
    .from('profiles')
    .upsert(
      {
        user_id: userId,
        cefr_level: assessment.level,
        cefr_language: assessment.language,
        cefr_note: assessment.note,
        cefr_assessed_at: assessment.assessedAt,
      },
      { onConflict: 'user_id' },
    )
  if (error) {
    console.error('[assess-cefr] persist failed:', error.message)
  }
}

// -- Post-session review ----------------------------------------------------

export type TranscriptEntry = { role: 'user' | 'tutor'; text: string }

export async function reviewTranscript(
  apiKey: string | undefined,
  params: { transcript?: TranscriptEntry[]; scenario?: string; language?: string },
): Promise<HandlerResult> {
  if (!apiKey) {
    return { status: 500, body: { error: 'OPENAI_API_KEY not set.' } }
  }
  const transcript = params.transcript ?? []
  if (transcript.length === 0) {
    return { status: 400, body: { error: 'Empty transcript.' } }
  }
  const langLabel = languageLabel(params.language)
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
            content: `You are reviewing a ${langLabel} language-learning conversation between a tutor and an English-speaking learner. Produce a JSON object with these exact keys:

- "summary": string. One or two sentences on what was practiced.
- "corrections": array of { "original": string, "corrected": string, "explanation": string }. Only include meaningful mistakes the learner made — skip tiny slips. Use the learner's exact words for "original". Keep "explanation" brief (one line), in English.
- "newVocabulary": array of { "word": string, "translation": string, "example": string }. Portuguese words/phrases the tutor introduced that are worth reviewing. Use a natural example sentence in Portuguese.
- "practiceNextTime": array of 2-4 short strings suggesting what to focus on next time.
- "memory": array of 2-4 short third-person factual bullets about the LEARNER that would be useful to recall in a future session. Examples: "Has a daughter named Lucy who is 7", "Works as a venture capitalist", "Lives in San Francisco but visits Brazil yearly", "Recently started reading Clarice Lispector". ONLY include facts the learner actually shared (people, places, work, hobbies, life events). Skip language-mechanics observations and anything trivial. Use empty array if the learner shared nothing personal.
- "name": string or null. The learner's first name if they explicitly told the tutor in this session (e.g. "I'm Steve" or "My name is Steve"). DO NOT guess from a transcription artifact. Null if they never said it.
- "inferredLevel": one of "complete-beginner", "novice", "intermediate", "advanced", or null. Your best estimate of their actual proficiency based on what they produced — NOT what they claimed. Use these markers: complete-beginner = no Portuguese produced, only English; novice = a few words/phrases like "olá", "obrigado", numbers; intermediate = full sentences with present + past tense, occasional errors; advanced = fluent and idiomatic. Null if you don't have enough signal.
- "nextFocus": string or null. ONE short sentence (max 25 words) telling the tutor what to silently bias the NEXT session toward. Combine the most useful grammar/vocab gap from this session with a personal-thread reference to keep continuity. Examples: "Lean on past tense — they kept defaulting to present when describing the weekend; reuse 'sogra' and 'Salvador'.", "Push them to use 'porque' and give reasons; revisit their daughter's school." Null if the session was too short to extract anything useful.

All eight keys must be present. Use empty arrays / null if there is genuinely nothing to report. Be concise.`,
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
  _stripeSecretKey: string | undefined,
): Promise<HandlerResult> {
  // Pick the most recently-updated subscription row for this user. If they
  // have both a Stripe and an Apple sub (rare edge case), this returns
  // whichever was most recently activity-modified — usually the one they
  // care about.
  const { data: row } = await supabaseAdmin()
    .from('subscriptions')
    .select('source, product_id, status, current_period_end, cancel_at_period_end')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!row) {
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
  return {
    status: 200,
    body: {
      plan: row.product_id,
      status: row.status,
      source: row.source,
      currentPeriodEnd: row.current_period_end,
      cancelAtPeriodEnd: row.cancel_at_period_end ?? false,
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
  // Only Stripe subs are cancelable via this path. Apple subscribers are told
  // by the iOS app to manage their subscription in iOS Settings (Apple's rule).
  const { data: row } = await supabaseAdmin()
    .from('subscriptions')
    .select('external_id, current_period_end')
    .eq('user_id', userId)
    .eq('source', 'stripe')
    .maybeSingle()
  if (!row?.external_id) {
    return { status: 400, body: { error: 'No active Stripe subscription to cancel.' } }
  }
  const form = new URLSearchParams()
  form.set('cancel_at_period_end', 'true')
  const r = await fetch(
    `https://api.stripe.com/v1/subscriptions/${row.external_id}`,
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
    .select('external_id, status')
    .eq('user_id', userId)
    .eq('source', 'stripe')
    .maybeSingle()
  if (!row?.external_id) {
    return { status: 400, body: { error: 'No Stripe subscription to reactivate.' } }
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
    `https://api.stripe.com/v1/subscriptions/${row.external_id}`,
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
      .select('external_id')
      .eq('user_id', userId)
      .eq('source', 'stripe')
      .maybeSingle()
    if (row?.external_id) {
      try {
        await fetch(
          `https://api.stripe.com/v1/subscriptions/${row.external_id}`,
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
  // (Apple IAPs that survive the local row are intentional: Apple controls
  // those subscriptions and we can only mark our copy gone; the user must
  // cancel via iOS Settings.)
  const admin = supabaseAdmin()
  await admin.from('subscriptions').delete().eq('user_id', userId)
  await admin.from('profiles').delete().eq('user_id', userId)
  await admin.from('usage').delete().eq('user_id', userId)
  // Finally delete the Supabase auth user. Once this returns, their JWT
  // becomes invalid and refresh-tokens won't issue new ones.
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) {
    return { status: 500, body: { error: error.message } }
  }
  return { status: 200, body: { ok: true } }
}
