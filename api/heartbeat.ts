import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  addDeviceUsageSeconds,
  addIpUsageSeconds,
  addPracticeSeconds,
  addUsageSeconds,
  checkSessionAccess,
  clientDeviceId,
  clientIpHash,
  clientPlatform,
  setSignupIpHashIfMissing,
  setSignupPlatformIfMissing,
} from '../lib/gating.js'
import { getUserIdFromAuthHeader } from '../lib/supabase-admin.js'
import {
  loadStreak,
  tickStreak,
  upsertLearnerProfile,
  type ServerLearnerProfile,
} from '../lib/api-handlers.js'

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
    /**
     * Learner onboarding profile to persist server-side. Sent right after
     * the initial onboarding completes (and harmless to resend on later
     * heartbeats — upsertLearnerProfile only fills set fields). This is how
     * the account, not the browser, becomes the source of truth for whether
     * onboarding is done. Piggybacked here to stay under Vercel Hobby's
     * 12-function limit.
     */
    profile?: ServerLearnerProfile
  }
  const seconds = Math.min(Math.max(0, Math.floor(body.seconds ?? 0)), 60)
  // Mirror trial usage into the per-IP bucket too — that's what
  // enforces the "can't cycle through anonymous accounts on the same
  // device" rule. Best-effort; if the migration hasn't been run yet
  // it logs and continues with the per-user cap only.
  const ipHash = clientIpHash(req.headers)
  // Per-device trial gating via Keychain UUID from iOS (header set by
  // Build 27+; see DeviceTrialId.swift). Null for web traffic and older
  // iOS builds — those just skip the device gate.
  const deviceId = clientDeviceId(req.headers)
  // Client platform (ios vs web) for the admin dashboard. Recorded once,
  // on the first heartbeat — same write-once pattern as the IP hash.
  const platform = clientPlatform(req.headers)
  // Practice-seconds counter for the admin dashboard. The client sends
  // seconds=0 for subscribed users (so they don't burn the trial cap)
  // but we still want their total practice time visible. Default to
  // the heartbeat interval (10s) when seconds=0 — slightly inaccurate
  // on the last partial heartbeat of a session, but fine signal for
  // a usage dashboard.
  const HEARTBEAT_INTERVAL_SECONDS = 10
  const practiceSeconds = seconds > 0 ? seconds : HEARTBEAT_INTERVAL_SECONDS
  try {
    await addUsageSeconds(userId, seconds)
    if (ipHash && seconds > 0) {
      await addIpUsageSeconds(ipHash, seconds)
    }
    if (deviceId && seconds > 0) {
      await addDeviceUsageSeconds(deviceId, seconds)
    }
    await addPracticeSeconds(userId, practiceSeconds)
    if (ipHash) {
      await setSignupIpHashIfMissing(userId, ipHash)
    }
    if (platform) {
      await setSignupPlatformIfMissing(userId, platform)
    }
    // Persist the onboarding profile if the client supplied one. Best-
    // effort inside upsertLearnerProfile (logs on failure) — keep it from
    // breaking the heartbeat's primary usage/streak job.
    if (body.profile && typeof body.profile === 'object') {
      await upsertLearnerProfile(userId, body.profile)
    }
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

  const access = await checkSessionAccess(userId, ipHash ?? undefined, deviceId ?? undefined)
  return res.status(200).json({
    subscribed: access.subscribed,
    secondsRemaining: access.secondsRemaining,
    streakCount: streak.streakCount,
    streakLastDay: streak.streakLastDay,
  })
}
