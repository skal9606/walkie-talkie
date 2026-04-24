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

All four keys must be present. Use empty arrays if there is genuinely nothing to report. Be concise.`,
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
