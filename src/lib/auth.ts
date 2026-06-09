import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { trackCompleteRegistration } from './tiktok'
import { identifyUser, resetUser } from './analytics'

/**
 * Tracks the current Supabase session. Returns { user, accessToken, loading }.
 * `accessToken` is the JWT to send as `Authorization: Bearer ...` when calling
 * our serverless API functions.
 */
export function useAuth(): {
  user: User | null
  accessToken: string | null
  loading: boolean
} {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
      // TikTok pixel: fire CompleteRegistration the first time we see
      // a real (non-anonymous) account on this device. The helper itself
      // is localStorage-deduped so repeat tabs / re-logins don't pollute.
      if (data.session?.user && data.session.user.is_anonymous === false) {
        trackCompleteRegistration()
        identifyUser(data.session.user.id, { email: data.session.user.email })
      }
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!mounted) return
      setSession(next)
      if (next?.user && next.user.is_anonymous === false) {
        trackCompleteRegistration()
        identifyUser(next.user.id, { email: next.user.email })
      }
    })
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return {
    user: session?.user ?? null,
    accessToken: session?.access_token ?? null,
    loading,
  }
}

/** sessionStorage flag dropped by signOut() so the freshly-loaded
 *  landing page can skip its "signed-in → /lessons" auto-redirect on
 *  the immediate next page load. Cleared on read. */
export const JUST_SIGNED_OUT_FLAG = 'walkie.justSignedOut'

export type LandingRedirectAction =
  | 'wait'
  | 'stay-on-landing'
  | 'redirect-to-lessons'

/** Pure decision: should Landing redirect a signed-in learner straight
 *  to /lessons, stay on the marketing page, or wait for auth to finish
 *  loading? The just-signed-out flag must only be consumed once we know
 *  we'd actually have redirected — otherwise the loading-state pass
 *  burns the flag before `user` has resolved, and the very next render
 *  (when supabase returns the still-cached session) bounces the user
 *  back to /lessons. That's the bug this function exists to prevent. */
export function decideLandingAction(args: {
  loading: boolean
  user: { is_anonymous?: boolean | null } | null
  justSignedOut: boolean
}): LandingRedirectAction {
  if (args.loading) return 'wait'
  if (!args.user) return 'stay-on-landing'
  if (args.user.is_anonymous) return 'stay-on-landing'
  if (args.justSignedOut) return 'stay-on-landing'
  return 'redirect-to-lessons'
}

export async function signOut(): Promise<void> {
  // Sign-out has two competing races:
  //   (a) Auth-state-change listeners on Lessons / Tutor react to the
  //       cleared session and React-Router-navigate to /login.
  //   (b) Landing.tsx auto-redirects signed-in users to /lessons. If
  //       we navigate to / before supabase has actually cleared the
  //       local session, Landing sees a still-signed-in user.
  //
  // Resolution:
  //   1. Drop a sessionStorage flag as belt-and-suspenders insurance
  //      so Landing skips its redirect even if supabase is still
  //      reporting a cached session.
  //   2. AWAIT supabase.auth.signOut() so the session is actually
  //      gone before we navigate. Fire-and-forget left a window where
  //      Landing could see the still-cached session.
  //   3. Use window.location.replace('/') instead of href = '/'. Both
  //      are hard navigations (canceling any React-Router-internal
  //      pending /login bounce), but replace also collapses the
  //      /lessons history entry so the back button doesn't put the
  //      user right back where they started.
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(JUST_SIGNED_OUT_FLAG, '1')
  }
  try {
    await supabase.auth.signOut()
  } catch {
    // Network failure shouldn't strand the user signed-in. The local
    // session is cleared either way; supabase will revoke server-side
    // on its next reachable call.
  }
  // Clear PostHog identity so the next user on this device starts fresh.
  resetUser()
  clearLocalUserDataOnSignOut()
  if (typeof window !== 'undefined') {
    window.location.replace('/')
  }
}

/**
 * Wipes localStorage entries that contain user-scoped data (profile,
 * streak, memory bullets, vocab, focus areas, lesson progress,
 * preferences). Tokens are already gone — Supabase's signOut clears
 * the session — but a second user on a shared device would otherwise
 * see the previous user's name, streak, etc. before signing in.
 *
 * Per-tutor scoped keys (e.g. `walkie_memory_v1.pt-br-natalia`) are
 * caught by a prefix sweep so we don't need to enumerate tutors.
 *
 * NOT cleared (intentional):
 *   - walkie.justSignedOut (the bounce-protection flag we just set)
 *   - walkie.tracked.* (TikTok pixel dedup keys — clearing them would
 *     double-count conversions for the next user; analytics ≠ PII)
 */
function clearLocalUserDataOnSignOut(): void {
  if (typeof window === 'undefined') return
  const EXACT_KEYS = [
    'walkie_preferences_v1',
    'walkie_profile_v1',
    'walkie_streak_v1',
    'walkie_streak_v2',
    'walkietalkie.lessonProgress.v1',
  ]
  const PREFIX_KEYS = [
    // These libs use `walkie_memory_v1.<tutorId>` etc. — the prefix
    // sweep also catches legacy unscoped keys at the same prefix.
    'walkie_memory_v1',
    'walkie_focus_v1',
    'walkie_vocab_v1',
  ]
  try {
    for (const k of EXACT_KEYS) localStorage.removeItem(k)
    // Iterate a snapshot of keys because removeItem mutates the live list.
    const allKeys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k) allKeys.push(k)
    }
    for (const key of allKeys) {
      for (const prefix of PREFIX_KEYS) {
        if (key === prefix || key.startsWith(prefix + '.')) {
          localStorage.removeItem(key)
          break
        }
      }
    }
  } catch {
    // localStorage can throw in private-mode Safari etc. Best-effort.
  }
}

/**
 * Returns the current access token from Supabase, asking it to refresh first
 * if needed. Use this right before any authenticated API call instead of a
 * React-cached `accessToken` — Supabase rotates the token transparently and
 * a stale cached copy can cause spurious 401s mid-session.
 */
export async function getFreshAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}
