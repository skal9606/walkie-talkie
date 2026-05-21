import type { VercelRequest, VercelResponse } from '@vercel/node'
import { addUsageSeconds, checkSessionAccess } from '../lib/gating.js'
import { getUserIdFromAuthHeader } from '../lib/supabase-admin.js'
import { loadStreak, tickStreak } from '../lib/api-handlers.js'

/**
 * Called ~every 10s while a session is live. Two jobs:
 *
 *   1. Track free-tier usage (increment the user's usage counter for the
 *      seconds elapsed since the previous heartbeat) and return their
 *      remaining trial seconds so the client knows when to stop.
 *
 *   2. Tick the daily-practice streak. The client also passes its current
 *      total session duration + its local date; once duration crosses 60s,
 *      we mark today as a practice day. Idempotent — calling repeatedly
 *      on the same date is a no-op, so heartbeats safely fire forever.
 *
 * Streak applies to subscribed AND free-tier users, so it lives here in
 * heartbeat (which fires for everyone) rather than gated behind usage.
 */
const STREAK_QUALIFYING_SECONDS = 60

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const userId = await getUserIdFromAuthHeader(req.headers.authorization)
  if (!userId) {
    return res.status(401).json({ error: 'Not signed in.' })
  }
  const body = (req.body ?? {}) as {
    seconds?: number
    /** Cumulative seconds in the current session so far. */
    sessionSeconds?: number
    /** YYYY-MM-DD in the learner's local timezone. */
    localDate?: string
  }
  const seconds = Math.min(Math.max(0, Math.floor(body.seconds ?? 0)), 60)
  try {
    await addUsageSeconds(userId, seconds)
  } catch (err) {
    return res.status(500).json({ error: String(err) })
  }

  // Streak tick — only fires once the current session has crossed the
  // 60s threshold AND the client supplied a local date. Underlying
  // tickStreak is idempotent, so we can fire on every qualifying
  // heartbeat without worrying about double-counting.
  let streak = await loadStreak(userId)
  const sessionSeconds = Math.max(0, Math.floor(body.sessionSeconds ?? 0))
  if (sessionSeconds >= STREAK_QUALIFYING_SECONDS && typeof body.localDate === 'string') {
    streak = await tickStreak(userId, body.localDate)
  }

  const access = await checkSessionAccess(userId)
  return res.status(200).json({
    subscribed: access.subscribed,
    secondsRemaining: access.secondsRemaining,
    streakCount: streak.streakCount,
    streakLastDay: streak.streakLastDay,
  })
}
