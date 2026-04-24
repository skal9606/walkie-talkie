import type { VercelRequest, VercelResponse } from '@vercel/node'
import { mintGatedSession } from '../lib/gating.js'
import { getUserIdFromAuthHeader } from '../lib/supabase-admin.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = await getUserIdFromAuthHeader(req.headers.authorization)
  if (!userId) {
    return res.status(401).json({ error: 'Not signed in.' })
  }
  const result = await mintGatedSession(userId, process.env.OPENAI_API_KEY)
  res.status(result.status).json(result.body)
}
