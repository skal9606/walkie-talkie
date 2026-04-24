import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createCheckoutSession } from '../lib/api-handlers.js'
import { getUserIdFromAuthHeader } from '../lib/supabase-admin.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const userId = await getUserIdFromAuthHeader(req.headers.authorization)
  if (!userId) {
    return res.status(401).json({ error: 'Not signed in.' })
  }
  const body = (req.body ?? {}) as {
    plan?: string
    successUrl?: string
    cancelUrl?: string
  }
  const result = await createCheckoutSession(
    {
      stripeSecretKey: process.env.STRIPE_SECRET_KEY,
      monthlyPriceId: process.env.STRIPE_MONTHLY_PRICE_ID,
      yearlyPriceId: process.env.STRIPE_YEARLY_PRICE_ID,
    },
    {
      plan: body.plan,
      successUrl: body.successUrl,
      cancelUrl: body.cancelUrl,
      userId,
    },
  )
  res.status(result.status).json(result.body)
}
