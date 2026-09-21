import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  checkRateLimit,
  clientDeviceId,
  clientIpHash,
  createGatedLiveSession,
  mintGatedSession,
  prepareLiveSession,
} from '../lib/gating.js'
import { getUserIdFromAuthHeader } from '../lib/supabase-admin.js'

// Tunables — picked to be generous for real users and tight enough to
// block the "burn OpenAI budget" attack. A real user mints ~once per
// conversation. 8 mints/min lets them recover from a couple of failed
// connects without hitting the cap.
const SESSION_MINTS_PER_MIN = 8

// Note: tried Edge runtime to cut cold-start time, but Vercel routed
// requests to a Singapore POP (x-vercel-id: sin1) while Supabase + the
// OpenAI Realtime endpoint are US-hot. Net effect was 4s vs 1.6s on
// Node — Edge's geo-distribution hurt because the backend hops can't
// follow. Staying on Node serverless until we have data on actual
// regional Supabase routing.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = await getUserIdFromAuthHeader(req.headers.authorization)
  if (!userId) {
    return res.status(401).json({ error: 'Not signed in.' })
  }
  // Language is passed as a query param so the server can return per-
  // language learner state (mistakes, memory, focus) without leaking
  // facts from one tutor into another's session. Legacy callers that
  // don't pass it just get empty state — no error.
  // Rate limit: cap session-token mints per user-minute. Anonymous
  // Supabase users (which we auto-create) are subject to the same cap,
  // closing the "burn the OpenAI budget by hammering /api/session" path.
  // Started here, awaited later: the GPT-Live paths run it in parallel with
  // their own database reads (it costs ~100–150ms on its own) and still
  // refuse before anything is minted. The Realtime path awaits it up front
  // as before.
  const rateLimitCheck = checkRateLimit(userId, 'session', SESSION_MINTS_PER_MIN, 60)
  const langParam = req.query?.language
  const language = typeof langParam === 'string' ? langParam : undefined
  // Hash the client IP for the per-IP trial cap (see 2026-05-21 migration).
  // Null in local dev (no x-forwarded-for header) — gating falls back to
  // per-user only when ipHash is null.
  const ipHash = clientIpHash(req.headers) ?? undefined
  // iOS Keychain-backed device identifier for the per-device trial cap
  // (see 2026-05-27 migration). Web clients don't send it (no Keychain
  // equivalent in browsers); pre-Build-27 iOS clients don't either. In
  // both cases the device gate is a no-op — per-user + per-IP still apply.
  const deviceId = clientDeviceId(req.headers) ?? undefined

  // GPT-Live engine (web since 2026-09-17, iOS since 2026-09-20). Folded into
  // this function rather than a new api/live-session.ts to stay under the
  // Vercel Hobby 12-function cap. POST = forward the browser's WebRTC
  // offer + prompt to OpenAI; GET ?engine=live = access check + learner
  // state without minting anything.
  if (req.method === 'POST') {
    const body = (req.body ?? {}) as { sdp?: unknown; instructions?: unknown; voice?: unknown }
    const result = await createGatedLiveSession(
      userId,
      process.env.OPENAI_API_KEY,
      body,
      ipHash,
      deviceId,
      rateLimitCheck,
    )
    return res.status(result.status).json(result.body)
  }
  if (req.query?.engine === 'live') {
    const result = await prepareLiveSession(userId, language, ipHash, deviceId, rateLimitCheck)
    return res.status(result.status).json(result.body)
  }

  if (!(await rateLimitCheck)) {
    return res.status(429).json({
      error: 'Too many session requests. Please wait a moment and try again.',
    })
  }
  const result = await mintGatedSession(
    userId,
    process.env.OPENAI_API_KEY,
    language,
    ipHash,
    deviceId,
  )
  res.status(result.status).json(result.body)
}
