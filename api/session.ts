import { mintGatedSession } from '../lib/gating.js'
import { getUserIdFromAuthHeader } from '../lib/supabase-admin.js'

// Run on Vercel's Edge runtime — ~50ms cold start vs ~500-1000ms for the
// Node.js serverless target. /api/session was the largest chunk (~1.6s) of
// the iOS Start-Conversation latency budget; Edge gets it under ~500ms cold,
// closer to ~200ms warm. Dependencies (`@supabase/supabase-js`, plain
// fetch to OpenAI) are all Web-standard / Edge-compatible.
export const config = { runtime: 'edge' }

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

export default async function handler(req: Request): Promise<Response> {
  const userId = await getUserIdFromAuthHeader(req.headers.get('authorization'))
  if (!userId) {
    return json({ error: 'Not signed in.' }, 401)
  }
  const result = await mintGatedSession(userId, process.env.OPENAI_API_KEY)
  return json(result.body, result.status)
}
