import type { VercelRequest, VercelResponse } from '@vercel/node'
import { mintGatedSession } from '../lib/gating.js'
import { getUserIdFromAuthHeader } from '../lib/supabase-admin.js'

// Note: tried Edge runtime to cut cold-start time, but Vercel routed
// requests to a Singapore POP (x-vercel-id: sin1) while Supabase + the
// OpenAI Realtime endpoint are US-hot. Net effect was 4s vs 1.6s on
// Node — Edge's geo-distribution hurt because the backend hops can't
// follow. Staying on Node serverless until we have data on actual
// regional Supabase routing.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = await getUserIdFromAuthHeader(req.headers.authorization)
  if (!userId) {
    return res.status(401).json({ error: 'Not signed in.' })
  }
  const result = await mintGatedSession(userId, process.env.OPENAI_API_KEY)
  res.status(result.status).json(result.body)
}
