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

function isActiveStatus(status: string | undefined | null): boolean {
  return status === 'active' || status === 'trialing'
}

/**
 * Looks up the user's subscription + usage and decides whether they can start
 * (or continue) a session. Ground truth — the client can mirror this for UI
 * but the server always re-checks here before minting a Realtime token.
 */
export async function checkSessionAccess(userId: string): Promise<GateResult> {
  const db = supabaseAdmin()

  const [subResult, usageResult] = await Promise.all([
    db.from('subscriptions').select('status').eq('user_id', userId).maybeSingle(),
    db.from('usage').select('seconds_used').eq('user_id', userId).maybeSingle(),
  ])

  if (isActiveStatus(subResult.data?.status)) {
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
 * subscription status + remaining seconds in the body.
 */
export async function mintGatedSession(
  userId: string,
  openAiKey: string | undefined,
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
  return {
    status: 200,
    body: {
      ...body,
      subscribed: access.subscribed,
      secondsRemaining: access.secondsRemaining,
    },
  }
}
