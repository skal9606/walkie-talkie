import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'

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
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!mounted) return
      setSession(next)
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

export async function signOut(): Promise<void> {
  // The sign-out flow has two competing races we have to dodge:
  //   (a) Auth-state-change listeners on mounted auth-gated pages
  //       (Lessons / Tutor) react when the session clears and bounce
  //       to /login. Awaiting signOut() before navigating lets them
  //       win — user lands on /login instead of /.
  //   (b) Landing.tsx auto-redirects signed-in users to /lessons. If
  //       we navigate to / before supabase has actually cleared the
  //       local session, Landing sees a still-signed-in user and
  //       bounces them back to /lessons.
  //
  // Resolution: drop a sessionStorage flag and hard-navigate to /
  // synchronously. Landing.tsx reads the flag on mount and skips its
  // auto-redirect once. The supabase signOut runs fire-and-forget on
  // the already-unmounting page — the token revocation lands when it
  // lands; the user is already on / with a clean session.
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(JUST_SIGNED_OUT_FLAG, '1')
    window.location.href = '/'
  }
  void supabase.auth.signOut()
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
