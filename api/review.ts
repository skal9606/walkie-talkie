import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  reviewTranscript,
  persistCefrAssessment,
  persistLearnerState,
  type TranscriptEntry,
  type CefrAssessment,
  type ReviewWithOptionalCefr,
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
    scenario?: string
    language?: string
    assessCefr?: boolean
  }
  const result = await reviewTranscript(process.env.OPENAI_API_KEY, {
    transcript: body.transcript,
    scenario: body.scenario,
    language: body.language,
    assessCefr: body.assessCefr === true,
  })
  // Persist CEFR + learner state if the review returned one. Both are
  // best-effort so a failed upsert doesn't block the review payload
  // reaching the client. Persisting learner state is what makes the
  // tutor able to weave previous mistakes / personal facts / focus area
  // into the NEXT session — see loadLearnerState in /api/session.
  if (result.status === 200) {
    const reviewBody = result.body as ReviewWithOptionalCefr & {
      corrections?: Array<{ original?: string; corrected?: string; explanation?: string }>
      memory?: string[]
      nextFocus?: string | null
    }
    if (reviewBody.cefr) {
      await persistCefrAssessment(userId, reviewBody.cefr as CefrAssessment)
    }
    const language = body.language ?? 'pt-BR'
    await persistLearnerState(userId, language, {
      corrections: reviewBody.corrections,
      memory: reviewBody.memory,
      nextFocus: reviewBody.nextFocus,
    })
  }
  res.status(result.status).json(result.body)
}
