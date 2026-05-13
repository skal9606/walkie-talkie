import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  assessCefr,
  persistCefrAssessment,
  type CefrAssessment,
  type TranscriptEntry,
} from '../lib/api-handlers.js'
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
    transcript?: TranscriptEntry[]
    language?: string
  }
  const result = await assessCefr(process.env.OPENAI_API_KEY, {
    transcript: body.transcript,
    language: body.language,
  })
  // Best-effort persistence — only on success. If the grader bailed (400
  // for empty transcript, 500 for upstream errors) there's nothing
  // assessment-shaped to save.
  if (result.status === 200) {
    await persistCefrAssessment(userId, result.body as CefrAssessment)
  }
  res.status(result.status).json(result.body)
}
