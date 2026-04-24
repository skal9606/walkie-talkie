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

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}
