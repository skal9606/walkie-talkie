import crypto from 'node:crypto'
import { mintSessionToken, type HandlerResult } from './api-handlers.js'
import { supabaseAdmin } from './supabase-admin.js'
import { FREE_TIER_SECONDS } from './constants.js'

export type GateResult = {
  allowed: boolean
  subscribed: boolean
  /** Seconds of free trial left. Large number when subscribed. */
  secondsRemaining: number
  reason?: string
}

// Subscription is "live" (entitles full access) when in any of these states.
// Covers Stripe (active/trialing/past_due) and Apple (in_grace_period during
// renewal retry windows). Excludes 'canceled', 'expired', 'on_hold'.
const ACTIVE_STATUSES = ['active', 'trialing', 'in_grace_period'] as const

/**
 * Looks up the user's subscription + usage and decides whether they can start
 * (or continue) a session. Ground truth — the client can mirror this for UI
 * but the server always re-checks here before minting a Realtime token.
 *
 * Pass `ipHash` to also enforce per-IP trial caps. When omitted, only the
 * per-user cap applies (back-compat for callers that don't know the IP).
 * IP gating exists to stop the "create a new anonymous account → fresh
 * 10 minutes" loop on the same device.
 */
export async function checkSessionAccess(
  userId: string,
  ipHash?: string,
): Promise<GateResult> {
  // Local dev bypass — set DEV_BYPASS_GATING=true in .env.local to grant
  // unlimited access without touching the subscriptions table. Never set
  // this in production env.
  if (process.env.DEV_BYPASS_GATING === 'true') {
    return { allowed: true, subscribed: true, secondsRemaining: Number.MAX_SAFE_INTEGER }
  }
  const db = supabaseAdmin()

  // A user can have multiple subscription rows (one Stripe + one Apple at
  // most). They're entitled to access if ANY of those rows is in an active
  // state. `.limit(1)` short-circuits — we don't need the full set.
  const [subResult, usageResult, ipUsageResult] = await Promise.all([
    db
      .from('subscriptions')
      .select('id')
      .eq('user_id', userId)
      .in('status', ACTIVE_STATUSES as unknown as string[])
      .limit(1)
      .maybeSingle(),
    db.from('usage').select('seconds_used').eq('user_id', userId).maybeSingle(),
    ipHash
      ? db.from('ip_usage').select('seconds_used').eq('ip_hash', ipHash).maybeSingle()
      : Promise.resolve({ data: null as { seconds_used?: number } | null }),
  ])

  // Subscribed users bypass every cap.
  if (subResult.data) {
    return { allowed: true, subscribed: true, secondsRemaining: Number.MAX_SAFE_INTEGER }
  }

  const userUsed = usageResult.data?.seconds_used ?? 0
  const ipUsed = ipUsageResult.data?.seconds_used ?? 0
  // The effective trial budget is bounded by BOTH the user's own usage
  // and the IP's aggregate usage. A new anonymous account on the same
  // device inherits whatever quota has already been burned through IP.
  const used = Math.max(userUsed, ipUsed)
  const remaining = Math.max(0, FREE_TIER_SECONDS - used)

  if (remaining <= 0) {
    return {
      allowed: false,
      subscribed: false,
      secondsRemaining: 0,
      reason: 'Your free trial is used up. Subscribe to keep practicing.',
    }
  }

  return { allowed: true, subscribed: false, secondsRemaining: remaining }
}

/**
 * Atomic increment via the increment_usage() Postgres function. Called from
 * /api/heartbeat while a free-tier session is live.
 */
export async function addUsageSeconds(userId: string, seconds: number): Promise<number> {
  const clamped = Math.max(0, Math.floor(seconds))
  if (clamped === 0) {
    const { data } = await supabaseAdmin()
      .from('usage')
      .select('seconds_used')
      .eq('user_id', userId)
      .maybeSingle()
    return data?.seconds_used ?? 0
  }
  const { data, error } = await supabaseAdmin().rpc('increment_usage', {
    p_user_id: userId,
    p_seconds: clamped,
  })
  if (error) throw error
  return (data as number) ?? 0
}

/**
 * Atomic increment of per-IP usage via increment_ip_usage() (see the
 * 2026-05-21-ip-trial-gate migration). Same usage pattern as addUsageSeconds
 * but keyed by hashed IP rather than user_id. Hash is SHA-256 so we never
 * store the raw address.
 */
export async function addIpUsageSeconds(ipHash: string, seconds: number): Promise<number> {
  const clamped = Math.max(0, Math.floor(seconds))
  if (clamped === 0) {
    const { data } = await supabaseAdmin()
      .from('ip_usage')
      .select('seconds_used')
      .eq('ip_hash', ipHash)
      .maybeSingle()
    return (data?.seconds_used as number | undefined) ?? 0
  }
  const { data, error } = await supabaseAdmin().rpc('increment_ip_usage', {
    p_ip_hash: ipHash,
    p_seconds: clamped,
  })
  if (error) {
    // Best-effort — if IP increment fails (e.g., migration not run yet),
    // don't block the session. Per-user gate still applies.
    console.error('[ip-gate] increment failed:', error.message)
    return 0
  }
  return (data as number) ?? 0
}

/**
 * Extract a stable client identifier from request headers and return its
 * SHA-256 hash. We hash so the raw IP is never persisted. Returns null in
 * dev / test where no IP is available — callers should fall back to
 * per-user gating only.
 */
export function clientIpHash(headers: Record<string, string | string[] | undefined>): string | null {
  const raw =
    (headers['x-forwarded-for'] as string | undefined) ??
    (headers['x-real-ip'] as string | undefined) ??
    null
  if (!raw) return null
  // x-forwarded-for can be "client, proxy1, proxy2" — take the first.
  const first = String(Array.isArray(raw) ? raw[0] : raw).split(',')[0].trim()
  if (!first) return null
  return crypto.createHash('sha256').update(first).digest('hex')
}

/**
 * Gated version of session-token minting. Returns 402 if the user is out of
 * free seconds and not subscribed; otherwise mints a token and includes
 * subscription status + remaining seconds + learner state (mistakes,
 * memory, focus) in the body. The learner state is what makes the tutor
 * able to weave previous-session continuity — see TutorPrompt on iOS.
 */
export async function mintGatedSession(
  userId: string,
  openAiKey: string | undefined,
  language?: string,
  ipHash?: string,
): Promise<HandlerResult> {
  const access = await checkSessionAccess(userId, ipHash)
  if (!access.allowed) {
    return {
      status: 402,
      body: {
        error: access.reason ?? 'Payment required',
        subscribed: access.subscribed,
        secondsRemaining: access.secondsRemaining,
      },
    }
  }
  const mint = await mintSessionToken(openAiKey)
  if (mint.status !== 200) return mint
  const body = mint.body && typeof mint.body === 'object' ? (mint.body as object) : {}

  // Load learner state for the requested language. Skipped when no language
  // is passed (legacy callers) — they just don't get continuity, no error.
  // Best-effort: any DB hiccup falls back to empty state, never blocks the
  // session mint.
  let learnerState: {
    mistakes: unknown[]
    memory: string[]
    nextFocus: string | null
  } = { mistakes: [], memory: [], nextFocus: null }
  if (language) {
    try {
      const { loadLearnerState } = await import('./api-handlers.js')
      learnerState = await loadLearnerState(userId, language)
    } catch (err) {
      console.error('[session] loadLearnerState failed:', err)
    }
  }

  // Pull current streak so the home screen can render immediately on
  // session start without a separate round-trip. Best-effort — a DB
  // hiccup just renders 0/null, never blocks the session mint.
  let streak: { streakCount: number; streakLastDay: string | null } = {
    streakCount: 0,
    streakLastDay: null,
  }
  try {
    const { loadStreak } = await import('./api-handlers.js')
    streak = await loadStreak(userId)
  } catch (err) {
    console.error('[session] loadStreak failed:', err)
  }

  return {
    status: 200,
    body: {
      ...body,
      subscribed: access.subscribed,
      secondsRemaining: access.secondsRemaining,
      recentMistakes: learnerState.mistakes,
      recentMemory: learnerState.memory,
      nextFocus: learnerState.nextFocus,
      streakCount: streak.streakCount,
      streakLastDay: streak.streakLastDay,
    },
  }
}
