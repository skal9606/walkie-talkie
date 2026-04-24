import type { VercelRequest, VercelResponse } from '@vercel/node'
import { translate } from '../lib/api-handlers.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const body = (req.body ?? {}) as { text?: string }
  const result = await translate(process.env.OPENAI_API_KEY, body.text)
  res.status(result.status).json(result.body)
}
