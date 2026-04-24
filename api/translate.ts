import type { VercelRequest, VercelResponse } from '@vercel/node'
import { translate } from '../lib/api-handlers.js'
import { getUserIdFromAuthHeader } from '../lib/supabase-admin.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const userId = await getUserIdFromAuthHeader(req.headers.authorization)
  if (!userId) {
    return res.status(401).json({ error: 'Not signed in.' })
  }
  const body = (req.body ?? {}) as { text?: string }
  const result = await translate(process.env.OPENAI_API_KEY, body.text)
  res.status(result.status).json(result.body)
}
