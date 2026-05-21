import type { VercelRequest, VercelResponse } from '@vercel/node'
import { synthesizeSpeech, translate, unsplashImageLookup } from '../lib/api-handlers.js'
import { checkRateLimit } from '../lib/gating.js'
import { getUserIdFromAuthHeader } from '../lib/supabase-admin.js'

// Translate (chat-completions), TTS (audio/speech), and image lookup
// (Unsplash) all live behind this one endpoint so we stay under the
// Vercel Hobby 12-function cap. Route on `type` in the body — default
// 'translate' for back-compat with existing callers.

// Per-user-minute caps. Real-world callers (vocab images, review TTS,
// occasional translate) burn at most ~5/min in normal use; 40/min is
// generous for that while shutting the OpenAI-proxy-abuse door.
const REQUESTS_PER_MIN = 40
// Defense against TTS / translate flooding with huge payloads. A
// vocabulary phrase is rarely past 100 chars; capping at 2000 leaves
// room for full sentences but blocks "synthesize War & Peace" abuse.
const MAX_TEXT_CHARS = 2000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const userId = await getUserIdFromAuthHeader(req.headers.authorization)
  if (!userId) {
    return res.status(401).json({ error: 'Not signed in.' })
  }
  const allowed = await checkRateLimit(userId, 'translate', REQUESTS_PER_MIN, 60)
  if (!allowed) {
    return res.status(429).json({
      error: 'Too many requests. Please wait a moment and try again.',
    })
  }
  const body = (req.body ?? {}) as {
    type?: 'translate' | 'tts' | 'image'
    text?: string
    language?: string
    voice?: string
    query?: string
  }
  // Length caps — applied before we hand strings off to OpenAI so an
  // attacker can't paste megabytes of text into a TTS request.
  if (typeof body.text === 'string' && body.text.length > MAX_TEXT_CHARS) {
    return res.status(400).json({ error: `text too long (max ${MAX_TEXT_CHARS} chars).` })
  }
  if (typeof body.query === 'string' && body.query.length > 200) {
    return res.status(400).json({ error: 'query too long (max 200 chars).' })
  }
  if (body.type === 'tts') {
    const result = await synthesizeSpeech(process.env.OPENAI_API_KEY, body.text, body.voice)
    return res.status(result.status).json(result.body)
  }
  if (body.type === 'image') {
    const result = await unsplashImageLookup(process.env.UNSPLASH_ACCESS_KEY, body.query)
    return res.status(result.status).json(result.body)
  }
  const result = await translate(process.env.OPENAI_API_KEY, body.text, body.language)
  res.status(result.status).json(result.body)
}
