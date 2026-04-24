import type { VercelRequest, VercelResponse } from '@vercel/node'
import { reviewTranscript, type TranscriptEntry } from '../lib/api-handlers.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const body = (req.body ?? {}) as { transcript?: TranscriptEntry[]; scenario?: string }
  const result = await reviewTranscript(process.env.OPENAI_API_KEY, {
    transcript: body.transcript,
    scenario: body.scenario,
  })
  res.status(result.status).json(result.body)
}
