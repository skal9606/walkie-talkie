import type { VercelRequest, VercelResponse } from '@vercel/node'
import { cancelSubscription } from '../lib/api-handlers.js'
import { getUserIdFromAuthHeader } from '../lib/supabase-admin.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' })
  }
  const userId = await getUserIdFromAuthHeader(req.headers.authorization)
  if (!userId) {
    return res.status(401).json({ error: 'Not signed in.' })
  }
  const result = await cancelSubscription(userId, process.env.STRIPE_SECRET_KEY)
  res.status(result.status).json(result.body)
}
