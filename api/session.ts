import type { VercelRequest, VercelResponse } from '@vercel/node'
import { mintSessionToken } from '../lib/api-handlers'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const result = await mintSessionToken(process.env.OPENAI_API_KEY)
  res.status(result.status).json(result.body)
}
