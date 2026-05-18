import type { VercelRequest, VercelResponse } from '@vercel/node'
import { synthesizeSpeech, translate, unsplashImageLookup } from '../lib/api-handlers.js'
import { getUserIdFromAuthHeader } from '../lib/supabase-admin.js'

// Translate (chat-completions), TTS (audio/speech), and image lookup
// (Unsplash) all live behind this one endpoint so we stay under the
// Vercel Hobby 12-function cap. Route on `type` in the body — default
// 'translate' for back-compat with existing callers.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const userId = await getUserIdFromAuthHeader(req.headers.authorization)
  if (!userId) {
    return res.status(401).json({ error: 'Not signed in.' })
  }
  const body = (req.body ?? {}) as {
    type?: 'translate' | 'tts' | 'image'
    text?: string
    language?: string
    voice?: string
    query?: string
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
