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
 */
export async function checkSessionAccess(userId: string): Promise<GateResult> {
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
  const [subResult, usageResult] = await Promise.all([
    db
      .from('subscriptions')
      .select('id')
      .eq('user_id', userId)
      .in('status', ACTIVE_STATUSES as unknown as string[])
      .limit(1)
      .maybeSingle(),
    db.from('usage').select('seconds_used').eq('user_id', userId).maybeSingle(),
  ])

  if (subResult.data) {
    return { allowed: true, subscribed: true, secondsRemaining: Number.MAX_SAFE_INTEGER }
  }

  const used = usageResult.data?.seconds_used ?? 0
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
): Promise<HandlerResult> {
  const access = await checkSessionAccess(userId)
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
